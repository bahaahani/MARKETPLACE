import 'dart:async';

/// ⚠️ SANDBOX customer session, standing in for eKey / OIDC login (see api/openapi.yaml).
///
/// The app sends `X-Sahel-Session: new` until the API has given it a session id (in the same response
/// header), then sends that id on every request. The id lives in memory only, so a restart starts a new
/// session as the demo customer; secure storage comes with the real login.
///
/// The first request establishes the session and the others wait for it, so parallel requests at start-up
/// do not each open their own session.
class SandboxSession {
  static const header = 'X-Sahel-Session';

  String? _id;
  Completer<void>? _establishing;

  /// The current session id, if the API has issued one.
  String? get id => _id;

  /// Headers for the next request. Waits while another request is establishing the session.
  Future<Map<String, String>> headers() async {
    while (_id == null && _establishing != null) {
      await _establishing!.future;
    }
    if (_id == null) _establishing = Completer<void>();
    return {header: _id ?? 'new'};
  }

  /// Reads the id the API returned (it may be a new one if the old session expired).
  void capture(Map<String, String> responseHeaders) {
    final id = responseHeaders[header.toLowerCase()];
    if (id != null && id.isNotEmpty) _id = id;
    _release();
  }

  /// The request failed without a response: let the next request try to establish the session.
  void failed() => _release();

  void _release() {
    final c = _establishing;
    _establishing = null;
    if (c != null && !c.isCompleted) c.complete();
  }
}
