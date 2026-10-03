import 'package:flutter/material.dart';

import 'tokens.g.dart';

ThemeData sahelTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: SahelColors.brand,
    primary: SahelColors.brand,
    secondary: SahelColors.islamic,
    surface: SahelColors.surface,
    error: SahelColors.danger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: SahelColors.background,
    fontFamily: 'IBM Plex Sans Arabic',
    appBarTheme: const AppBarTheme(backgroundColor: SahelColors.surface, foregroundColor: SahelColors.text, elevation: 0, scrolledUnderElevation: 1),
    cardTheme: CardThemeData(
      color: SahelColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SahelRadius.md),
        side: const BorderSide(color: SahelColors.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SahelRadius.sm)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
  );
}
