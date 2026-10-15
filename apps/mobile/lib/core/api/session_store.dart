import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the customer session id is kept between launches. Injectable so tests use a fake.
abstract class SessionStore {
  Future<String?> read();
  Future<void> write(String id);
  Future<void> delete();
}

/// Nothing survives a restart. Used on web (no secure storage in a browser: the web app has its HttpOnly cookie
/// instead, see docs/12-web-platform.md) and as the fallback when the platform store fails.
class MemorySessionStore implements SessionStore {
  String? _id;

  @override
  Future<String?> read() async => _id;

  @override
  Future<void> write(String id) async => _id = id;

  @override
  Future<void> delete() async => _id = null;
}

/// Keychain (iOS) / Keystore-backed encrypted preferences (Android). The value is the session id only: never
/// a CPR, token or profile data. Never log what this reads or writes.
class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // Not synced to iCloud Keychain or restored onto another device.
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
            );

  static const key = 'sahel.session.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: key);

  @override
  Future<void> write(String id) => _storage.write(key: key, value: id);

  @override
  Future<void> delete() => _storage.delete(key: key);
}
