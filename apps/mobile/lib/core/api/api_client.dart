import 'dart:convert';
import 'dart:io' show Platform;

import 'package:http/http.dart' as http;

/// Base URL of the shared API (served by the Next.js app today: apps/web/app/api/v1).
/// Override with: flutter run --dart-define=API_BASE_URL=https://api.sahel.bcfc.bh
String defaultApiBaseUrl() {
  const fromEnv = String.fromEnvironment('API_BASE_URL');
  if (fromEnv.isNotEmpty) return fromEnv;
  // Android emulator reaches the host machine on 10.0.2.2.
  return Platform.isAndroid ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.code, this.message);
  final int statusCode;
  final String code;
  final String message;

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}

class ApiClient {
  ApiClient({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;
  final http.Client _http;

  Uri _uri(String path, [Map<String, String?>? query]) {
    final q = {for (final e in (query ?? {}).entries) if (e.value != null && e.value!.isNotEmpty) e.key: e.value!};
    return Uri.parse('$baseUrl/api/v1$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Future<dynamic> get(String path, {Map<String, String?>? query}) async =>
      _decode(await _http.get(_uri(path, query), headers: {'Accept': 'application/json'}));

  Future<dynamic> post(String path, Object body, {Map<String, String>? headers}) async => _decode(await _http.post(
        _uri(path),
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json', ...?headers},
        body: jsonEncode(body),
      ));

  Future<dynamic> patch(String path, Object body) async => _decode(await _http.patch(
        _uri(path),
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: jsonEncode(body),
      ));

  dynamic _decode(http.Response r) {
    final body = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    if (r.statusCode >= 400) {
      final err = (body['error'] as Map<String, dynamic>?) ?? {};
      throw ApiException(r.statusCode, err['code'] as String? ?? 'HTTP_${r.statusCode}', err['message'] as String? ?? r.reasonPhrase ?? '');
    }
    return body['data'];
  }
}
