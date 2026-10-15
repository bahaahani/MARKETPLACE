/// Deep links: the same URLs as the web app open the same screen in the app.
///
///   https://WEB_HOST/{en|ar}/cars/v-honda-crv-2026?requestId=r1  ->  /cars/v-honda-crv-2026?requestId=r1 (English)
///   sahel://rewards                                                 ->  /rewards
///   sahel:///ar/claims/clm_1                                        ->  /claims/clm_1 (Arabic)
///
/// Pure functions, no business logic. Anything that is not a known screen on a known host resolves to home:
/// a link can never push an unlisted route, another site's URL or script into the router.
library;

/// Languages the web app uses as the first path segment.
const deepLinkLocales = {'en', 'ar'};

/// The custom URL scheme registered in AndroidManifest.xml and Info.plist (works without a verified domain).
const deepLinkScheme = 'sahel';

/// Where a link leads: an app route (path plus optional query) and the language the link asked for, if any.
class DeepLink {
  const DeepLink(this.location, {this.languageCode});

  /// Always starts with `/`, e.g. `/cars/abc?requestId=r1`.
  final String location;
  final String? languageCode;

  static const home = DeepLink('/');

  @override
  bool operator ==(Object other) => other is DeepLink && other.location == location && other.languageCode == languageCode;

  @override
  int get hashCode => Object.hash(location, languageCode);

  @override
  String toString() => 'DeepLink($location, $languageCode)';
}

/// Ids in paths (vehicle, claim, request, card, ...): letters, digits, `_` and `-`. No dots, so `..` never fits.
final _id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$');
const _maxQueryLength = 1024;

/// The screens a link may open: the go_router routes of app.dart that the web also has. `:id` is one id segment.
/// Web-only areas (dealer, backoffice) are not here on purpose.
const _routes = <String>[
  '/',
  '/cars',
  '/cars/:id',
  '/property',
  '/property/:id',
  '/cards',
  '/cards/:id/apply',
  '/account',
  '/insurance',
  '/insurance/travel',
  '/insurance/home',
  '/insurance/medical',
  '/insurance/life',
  '/onboarding',
  '/checkout',
  '/finance/personal',
  '/applications/:id',
  '/life-events',
  '/life-events/:id',
  '/assistant',
  '/trade-in',
  '/claims/new',
  '/claims/:id',
  '/rewards',
  '/notifications',
  '/notifications/preferences',
  '/requests/new',
  '/requests/:id',
];

final _patterns = [for (final r in _routes) r == '/' ? <String>[] : r.substring(1).split('/')];

bool _allowed(List<String> segments) {
  for (final p in _patterns) {
    if (p.length != segments.length) continue;
    var ok = true;
    for (var i = 0; i < p.length && ok; i++) {
      ok = p[i] == ':id' ? _id.hasMatch(segments[i]) : p[i] == segments[i];
    }
    if (ok) return true;
  }
  return false;
}

/// True when [location] (an in-app location such as `/en/cars/x`, or a full URL) is something this file should
/// translate, as opposed to an ordinary in-app route like `/cars/x`.
bool isExternalLink(Uri uri) => uri.hasScheme || uri.hasAuthority || (uri.pathSegments.isNotEmpty && deepLinkLocales.contains(uri.pathSegments.first));

/// Maps a web URL, a `sahel://` URL or a web path (`/ar/cars/x`) to an app route.
///
/// [webOrigin] is the only https origin whose URLs are accepted (scheme, host and port must match exactly; no
/// user info). Unknown hosts, schemes (`javascript:`, `file:`, ...), paths, empty or `..` segments and
/// over-long queries resolve to [DeepLink.home]; a query that is too long is dropped from an otherwise good link.
DeepLink resolveDeepLink(String input, {required Uri webOrigin}) {
  try {
    return _resolve(input, webOrigin);
  } on FormatException {
    return DeepLink.home; // e.g. a malformed %-escape
  } on ArgumentError {
    return DeepLink.home;
  }
}

DeepLink _resolve(String input, Uri webOrigin) {
  final raw = input.trim();
  // No control characters or backslashes anywhere (browsers treat `\` like `/`, which hides hosts and paths).
  if (raw.isEmpty || raw.contains(RegExp(r'[\x00-\x1f\x7f\\]'))) return DeepLink.home;
  // Uri.parse would quietly resolve /cars/../account to /account; a link that tries it is refused instead.
  final beforeQuery = raw.split(RegExp(r'[?#]')).first.replaceAll(RegExp('%2e', caseSensitive: false), '.');
  if (beforeQuery.split('/').any((s) => s == '.' || s == '..')) return DeepLink.home;
  final uri = Uri.tryParse(raw);
  if (uri == null) return DeepLink.home;

  List<String> segments;
  if (uri.scheme.toLowerCase() == deepLinkScheme) {
    if (uri.hasPort || uri.userInfo.isNotEmpty) return DeepLink.home;
    // sahel://cars/abc has host "cars"; sahel:///cars/abc has none. Both mean /cars/abc.
    segments = [if (uri.host.isNotEmpty) uri.host, ...uri.pathSegments];
  } else if (uri.hasScheme || uri.hasAuthority) {
    final sameOrigin = uri.scheme.toLowerCase() == webOrigin.scheme &&
        uri.host.toLowerCase() == webOrigin.host.toLowerCase() &&
        uri.port == webOrigin.port &&
        uri.userInfo.isEmpty;
    if (!sameOrigin) return DeepLink.home;
    segments = uri.pathSegments;
  } else {
    if (!raw.startsWith('/') || raw.startsWith('//')) return DeepLink.home;
    segments = uri.pathSegments;
  }

  // One trailing slash is fine (/en/cars/); an empty segment anywhere else (//) is not.
  if (segments.isNotEmpty && segments.last.isEmpty) segments = segments.sublist(0, segments.length - 1);
  if (segments.any((s) => s.isEmpty)) return DeepLink.home;

  String? language;
  if (segments.isNotEmpty && deepLinkLocales.contains(segments.first)) {
    language = segments.first;
    segments = segments.sublist(1);
  }
  if (!_allowed(segments)) return DeepLink.home;

  final path = '/${segments.join('/')}';
  final query = uri.hasQuery && uri.query.length <= _maxQueryLength ? uri.queryParametersAll : const <String, List<String>>{};
  final location = query.isEmpty ? path : Uri(path: path, queryParameters: query).toString();
  return DeepLink(location, languageCode: language);
}
