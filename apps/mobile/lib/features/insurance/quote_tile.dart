import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';

/// One insurer's offer in a comparison list: name, Takaful badge, details, price and "Buy".
class InsurerQuoteTile extends StatelessWidget {
  const InsurerQuoteTile({
    super.key,
    required this.insurerId,
    required this.insurerName,
    required this.takaful,
    required this.details,
    required this.price,
    required this.onBuy,
  });

  final String insurerId;
  final Localized insurerName;
  final bool takaful;
  final List<String> details;
  final String price;
  final VoidCallback? onBuy;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Row(children: [
        Flexible(child: Text(context.loc(insurerName), style: const TextStyle(fontWeight: FontWeight.w600))),
        if (takaful) ...[const SizedBox(width: 6), Pill(l.takaful, color: SahelColors.islamic, background: SahelColors.islamicSoft)],
      ]),
      subtitle: Text(details.join(' · ')),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text(price, style: const TextStyle(fontWeight: FontWeight.bold)),
        InkWell(
          key: Key('buy-$insurerId'),
          onTap: onBuy,
          child: Text(l.buyPolicy, style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}
