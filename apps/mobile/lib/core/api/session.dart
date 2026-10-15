import 'dart:async';

import 'session_store.dart';

/// ⚠️ SANDBOX customer session, standing in for eKey / OIDC login (see api/openapi.yaml).
///
/// The app sends `X-Sahel-Session: new` until the API has given it a session id (in the same response
/// header), then sends that id on every request. The id is kept in platform secure storage ([SessionStore]),
/// restored on launch, and cleared on logout or a 401. If storage fails, the session lives in memory only.
/// The id is never logged.
///
/// The first request establishes the session and the others wait for it, so parallel requests at start-up
/// do not each open their own session.
class SandboxSession {
  SandboxSession({SessionStore? store}) : _store = store ?? MemorySessionStore();

  static const header = 'X-Sahel-Session';

  /// What an id the API issues looks like (opaque, URL-safe). Anything else read back from storage is
  /// treated as corrupted and dropped.
  static final _validId = RegExp(r'^[A-Za-z0-9_-]{16,128}$');

  final SessionStore _store;
  String? _id;
  Completer<void>? _establishing;
  Future<void>? _restored;
  Future<void> _writes = Future.value();

  /// The current session id, if the API has issued one.
  String? get id => _id;

  /// Completes when pending saves to storage are done (tests, shutdown).
  Future<void> get settled => _writes;

  /// Loads the saved id once. Safe to call more than once; [headers] calls it too.
  Future<void> restore() => _restored ??= _restore();

  Future<void> _restore() async {
    try {
      final saved = await _store.read();
      if (saved == null) return;
      if (_validId.hasMatch(saved)) {
        _id ??= saved;
      } else {
        _enqueue(_store.delete); // corrupted: start a new session
      }
    } catch (_) {
      // Storage unavailable: continue in memory.
    }
  }

  /// Headers for the next request. Waits while another request is establishing the session.
  Future<Map<String, String>> headers() async {
    await restore();
    while (_id == null && _establishing != null) {
      await _establishing!.future;
    }
    if (_id == null) _establishing = Completer<void>();
    return {header: _id ?? 'new'};
  }

  /// Reads the id the API returned (it may be a new one if the old session expired).
  void capture(Map<String, String> responseHeaders) {
    final id = responseHeaders[header.toLowerCase()];
    if (id != null && id.isNotEmpty && id != _id) {
      _id = id;
      if (_validId.hasMatch(id)) _enqueue(() => _store.write(id));
    }
    _release();
  }

  /// Forgets the session (logout, or the API said 401): the next request starts a new one.
  Future<void> clear() {
    _id = null;
    _release();
    _enqueue(_store.delete);
    return settled;
  }

  /// The request failed without a response: let the next request try to establish the session.
  void failed() => _release();

  void _enqueue(Future<void> Function() op) {
    _writes = _writes.then((_) => op()).catchError((_) {
      // Storage failure: the id stays in memory for this run.
    });
  }

  void _release() {
    final c = _establishing;
    _establishing = null;
    if (c != null && !c.isCompleted) c.complete();
  }

  @override
  String toString() => 'SandboxSession(established: ${_id != null})';
}
