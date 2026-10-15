import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sahel/core/api/api_client.dart';
import 'package:sahel/core/api/session.dart';
import 'package:sahel/core/api/session_store.dart';
import 'package:sahel/core/config.dart';

final _id = 'abcDEF123_-abcDEF123_-abcDEF123_';
final _id2 = 'ZZZZ123_-abcDEF123_-abcDEF123_zz';

/// A store that records calls, can hold a value, and can be told to fail.
class FakeSessionStore implements SessionStore {
  FakeSessionStore([this.value]);
  String? value;
  bool failReads = false;
  bool failWrites = false;
  final calls = <String>[];

  @override
  Future<String?> read() async {
    calls.add('read');
    if (failReads) throw Exception('keystore unavailable');
    return value;
  }

  @override
  Future<void> write(String id) async {
    calls.add('write');
    if (failWrites) throw Exception('keystore unavailable');
    value = id;
  }

  @override
  Future<void> delete() async {
    calls.add('delete');
    if (failWrites) throw Exception('keystore unavailable');
    value = null;
  }
}

void main() {
  group('session storage', () {
    test('restores the saved id on launch and sends it on the first request', () async {
      final store = FakeSessionStore(_id);
      final session = SandboxSession(store: store);
      expect(await session.headers(), {'X-Sahel-Session': _id});
      expect(session.id, _id);
    });

    test('first launch has nothing saved: asks for a new session', () async {
      final session = SandboxSession(store: FakeSessionStore());
      expect(await session.headers(), {'X-Sahel-Session': 'new'});
      expect(session.id, isNull);
    });

    test('persists the id the API issues, and a changed one replaces it', () async {
      final store = FakeSessionStore();
      final session = SandboxSession(store: store);
      await session.headers();
      session.capture({'x-sahel-session': _id});
      await session.settled;
      expect(store.value, _id);
      await session.headers();
      session.capture({'x-sahel-session': _id}); // same id again: no extra write
      session.capture({'x-sahel-session': _id2});
      await session.settled;
      expect(store.value, _id2);
      expect(store.calls.where((c) => c == 'write'), hasLength(2));
    });

    test('clear() forgets the id in memory and in storage; the next request starts a new session', () async {
      final store = FakeSessionStore(_id);
      final session = SandboxSession(store: store);
      await session.headers();
      await session.clear();
      expect(session.id, isNull);
      expect(store.value, isNull);
      expect(await session.headers(), {'X-Sahel-Session': 'new'});
    });

    test('a corrupted saved value is dropped, not sent', () async {
      for (final bad in ['', 'short', 'has spaces and is long enough to pass length 16', 'x' * 500, 'new', '../../etc/passwd-padded-padded']) {
        final store = FakeSessionStore(bad);
        final session = SandboxSession(store: store);
        expect(await session.headers(), {'X-Sahel-Session': 'new'}, reason: bad);
        await session.settled;
        expect(store.value, isNull, reason: 'corrupted value deleted: $bad');
      }
    });

    test('storage that fails to read falls back to memory and still works', () async {
      final store = FakeSessionStore(_id)..failReads = true;
      final session = SandboxSession(store: store);
      expect(await session.headers(), {'X-Sahel-Session': 'new'});
      session.capture({'x-sahel-session': _id2});
      expect(session.id, _id2);
      expect(await session.headers(), {'X-Sahel-Session': _id2});
    });

    test('storage that fails to write keeps the id in memory for this run', () async {
      final store = FakeSessionStore()..failWrites = true;
      final session = SandboxSession(store: store);
      await session.headers();
      session.capture({'x-sahel-session': _id});
      await session.settled; // must not throw
      expect(session.id, _id);
      await session.clear(); // delete failure is swallowed too
      expect(session.id, isNull);
    });

    test('restore runs once even with parallel first requests', () async {
      final store = FakeSessionStore(_id);
      final session = SandboxSession(store: store);
      await Future.wait([session.headers(), session.headers(), session.headers()]);
      expect(store.calls.where((c) => c == 'read'), hasLength(1));
    });

    test('the id never shows in toString', () async {
      final session = SandboxSession(store: FakeSessionStore(_id));
      await session.headers();
      expect(session.toString(), isNot(contains(_id)));
    });

    test('memory store behaves like a store', () async {
      final s = MemorySessionStore();
      expect(await s.read(), isNull);
      await s.write(_id);
      expect(await s.read(), _id);
      await s.delete();
      expect(await s.read(), isNull);
    });
  });

  group('ApiClient and the stored session', () {
    test('a restart sends the saved id instead of opening a new session', () async {
      final store = FakeSessionStore();
      final seen = <String?>[];
      final client = MockClient((req) async {
        seen.add(req.headers['X-Sahel-Session']);
        return http.Response('{"data":{}}', 200, headers: {'x-sahel-session': _id});
      });
      await ApiClient(baseUrl: 'http://test', client: client, session: SandboxSession(store: store)).get('/me');
      await Future<void>.delayed(Duration.zero);
      // "Restart": a new client and session over the same storage.
      final second = ApiClient(baseUrl: 'http://test', client: client, session: SandboxSession(store: store));
      await second.get('/me');
      expect(seen, ['new', _id]);
    });

    test('a 401 clears the session (memory and storage), and the error still reaches the caller', () async {
      final store = FakeSessionStore(_id);
      final client = MockClient((req) async => http.Response(jsonEncode({'error': {'code': 'UNAUTHENTICATED', 'message': 'Sign in'}}), 401));
      final api = ApiClient(baseUrl: 'http://test', client: client, session: SandboxSession(store: store));
      await expectLater(api.get('/me'), throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)));
      await api.session.settled;
      expect(api.session.id, isNull);
      expect(store.value, isNull);
    });

    test('a 401 while the session is being established does not block the next request', () async {
      final client = MockClient((req) async => http.Response('{"error":{"code":"UNAUTHENTICATED","message":"x"}}', 401));
      final api = ApiClient(baseUrl: 'http://test', client: client, session: SandboxSession(store: FakeSessionStore()));
      await expectLater(api.get('/me'), throwsA(isA<ApiException>()));
      await expectLater(api.get('/me'), throwsA(isA<ApiException>()));
    });
  });

  group('build identity stays consistent', () {
    // The deep-link host is written in three places: env/*.json (Dart), android/app/build.gradle.kts (manifest
    // placeholder) and ios/Flutter/*.xcconfig (associated domains). They must agree.
    for (final env in ['dev', 'staging', 'prod']) {
      test('$env: env file, Android flavor and iOS xcconfig use the same web host', () {
        final json = jsonDecode(File('env/$env.json').readAsStringSync()) as Map<String, dynamic>;
        expect(json['APP_ENV'], env);
        final host = Uri.parse(json['WEB_ORIGIN'] as String).host;
        expect(host, AppConfig.fromValues(environment: env).webHost, reason: 'AppConfig default matches env/$env.json');
        final gradle = File('android/app/build.gradle.kts').readAsStringSync();
        expect(RegExp('create\\("$env"\\)\\s*\\{[^}]*?webHost"\\s*to\\s*"([^"]+)"', dotAll: true).firstMatch(gradle)?.group(1), host);
        final xcconfig = File('ios/Flutter/${env[0].toUpperCase()}${env.substring(1)}.xcconfig').readAsStringSync();
        expect(RegExp(r'^SAHEL_WEB_HOST\s*=\s*(\S+)', multiLine: true).firstMatch(xcconfig)?.group(1), host);
      });
    }
  });
}
