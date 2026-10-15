import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Read the build configuration (--dart-define-from-file=env/<name>.json) once, so a bad APP_ENV or WEB_ORIGIN
  // fails at start-up instead of on the first request.
  final config = AppConfig.fromEnvironment();
  runApp(ProviderScope(
    overrides: [appConfigProvider.overrideWithValue(config)],
    child: const SahelApp(),
  ));
}
