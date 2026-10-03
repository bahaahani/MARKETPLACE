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

extension Fmt on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
  String get lang => Localizations.localeOf(this).languageCode;
  String money(int fils, {int decimals = 3}) => formatBhd(fils, lang, decimals: decimals);
  String number(int n) => NumberFormat.decimalPattern('en').format(n);
  String date(DateTime d) => DateFormat.yMMMd(lang).format(d);
  String loc(Localized l) => l.of(lang);
}
