import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Which backend and branding this build talks to. Chosen at build time with
/// `--dart-define-from-file=env/<name>.json` (and the matching native flavor).
enum AppEnvironment {
  dev,
  staging,
  prod;

  /// `APP_ENV` value to environment. Empty means a plain `flutter run` / test: dev.
  static AppEnvironment parse(String value) {
    if (value.isEmpty) return AppEnvironment.dev;
    for (final e in values) {
      if (e.name == value) return e;
    }
    throw FormatException('APP_ENV must be one of dev, staging, prod (got "$value")');
  }
}

/// Feature flags that depend on the environment, not on the customer.
class AppFeatureFlags {
  const AppFeatureFlags({required this.sandboxBanner});

  /// A small "Sandbox" / "Staging" label on every screen, so a test build is never mistaken for the live app.
  final bool sandboxBanner;
}

/// Typed build configuration. Dart-define keys (all optional, see env/*.json):
///   APP_ENV       dev | staging | prod (default dev)
///   API_BASE_URL  the shared API (default: the local Next.js app; 10.0.2.2 on the Android emulator)
///   WEB_ORIGIN    origin of the Sahel web app: the host deep links and shared URLs use
class AppConfig {
  AppConfig._({required this.environment, required this.apiBaseUrl, required this.webOrigin})
      : features = AppFeatureFlags(sandboxBanner: environment != AppEnvironment.prod);

  /// Reads the compile-time dart-defines of this build.
  factory AppConfig.fromEnvironment() => AppConfig.fromValues(
        environment: const String.fromEnvironment('APP_ENV'),
        apiBaseUrl: const String.fromEnvironment('API_BASE_URL'),
        webOrigin: const String.fromEnvironment('WEB_ORIGIN'),
      );

  /// Same rules as [AppConfig.fromEnvironment] with explicit values (tests, tooling).
  factory AppConfig.fromValues({
    String environment = '',
    String apiBaseUrl = '',
    String webOrigin = '',
    TargetPlatform? platform,
    bool? isWeb,
  }) {
    final env = AppEnvironment.parse(environment);
    final onAndroid = !(isWeb ?? kIsWeb) && (platform ?? defaultTargetPlatform) == TargetPlatform.android;
    // The Android emulator reaches the host machine on 10.0.2.2.
    final api = apiBaseUrl.isNotEmpty ? apiBaseUrl : (onAndroid ? 'http://10.0.2.2:3000' : 'http://localhost:3000');
    final origin = Uri.parse(webOrigin.isNotEmpty ? webOrigin : defaultWebOrigins[env]!);
    if (!origin.hasAuthority || origin.host.isEmpty || (origin.scheme != 'https' && origin.scheme != 'http')) {
      throw FormatException('WEB_ORIGIN must be an http(s) origin (got "$webOrigin")');
    }
    return AppConfig._(
      environment: env,
      apiBaseUrl: api.endsWith('/') ? api.substring(0, api.length - 1) : api,
      webOrigin: Uri(scheme: origin.scheme, host: origin.host, port: origin.hasPort ? origin.port : null),
    );
  }

  /// ⚠️ PLACEHOLDER hosts (`.example` is reserved and can never be claimed by anyone). Replace with the real web
  /// domains, and keep android/app/build.gradle.kts (`webHost`) and ios/Flutter/*.xcconfig (`SAHEL_WEB_HOST`) in
  /// step. Owner: IT (domains). See docs/15-mobile-release.md.
  static final Map<AppEnvironment, String> defaultWebOrigins = {
    AppEnvironment.dev: 'https://dev.sahel.bcfc.example',
    AppEnvironment.staging: 'https://staging.sahel.bcfc.example',
    AppEnvironment.prod: 'https://sahel.bcfc.example',
  };

  final AppEnvironment environment;

  /// Base URL of the shared API (no trailing slash).
  final String apiBaseUrl;

  /// The Sahel web origin (scheme, host, optional port) that deep links on this build belong to.
  final Uri webOrigin;
  final AppFeatureFlags features;

  bool get isProd => environment == AppEnvironment.prod;
  String get webHost => webOrigin.host;
}

final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());
