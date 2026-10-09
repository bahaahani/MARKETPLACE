import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../l10n/gen/app_localizations.dart';
import 'models.dart';

/// Same output as formatBhd() in @sahel/domain: "BHD 1,234.500" / "1,234.500 د.ب.".
/// Arabic uses Latin digits on both web and mobile.
String formatBhd(int fils, String languageCode, {int decimals = 3}) {
  final f = NumberFormat.decimalPatternDigits(locale: 'en', decimalDigits: decimals);
  final n = f.format(fils / 1000);
  return languageCode == 'ar' ? '$n د.ب.' : 'BHD $n';
}

const _maxSafeInteger = 9007199254740991; // Number.MAX_SAFE_INTEGER

/// Same as parseBhdInput() in @sahel/domain: "1,400.5" → 1400500 fils, without floats.
/// Returns null for anything that is not a non-negative amount with at most 3 decimals.
int? parseBhdInput(String text) {
  final m = RegExp(r'^(\d+)(?:\.(\d{1,3}))?$').firstMatch(text.trim().replaceAll(',', ''));
  if (m == null) return null;
  final whole = int.tryParse(m.group(1)!);
  // Same bound as the TypeScript version (Number.isSafeInteger), and no 64-bit overflow.
  if (whole == null || whole > _maxSafeInteger ~/ 1000) return null;
  final fils = whole * 1000 + int.parse((m.group(2) ?? '').padRight(3, '0'));
  return fils <= _maxSafeInteger ? fils : null;
}

/// The Asia/Bahrain calendar day (UTC+3, no daylight saving) of an instant, as a date-only [DateTime].
DateTime bahrainCalendarDay(DateTime instant) {
  final b = instant.toUtc().add(const Duration(hours: 3));
  return DateTime(b.year, b.month, b.day);
}

extension Fmt on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
  String get lang => Localizations.localeOf(this).languageCode;
  String money(int fils, {int decimals = 3}) => formatBhd(fils, lang, decimals: decimals);
  String number(int n) => NumberFormat.decimalPattern('en').format(n);
  String date(DateTime d) => DateFormat.yMMMd(lang).format(d);

  /// An API instant shown on its Asia/Bahrain calendar day (UTC+3, no daylight saving), not the device's, so it
  /// matches the web.
  String bahrainDate(DateTime instant) => date(bahrainCalendarDay(instant));
  String loc(Localized l) => l.of(lang);
}
