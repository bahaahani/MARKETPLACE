// Life-event bundles and early settlement. Mirrors the shared API (api/openapi.yaml);
// every figure is computed server-side in @sahel/domain. Money is integer fils.

import '../models.dart';

class LifeEvent {
  const LifeEvent({required this.id, required this.icon, required this.title, required this.subtitle});
  final String id;
  final String icon;
  final Localized title;
  final Localized subtitle;

  factory LifeEvent.fromJson(Json j) => LifeEvent(
        id: j['id'] as String,
        icon: j['icon'] as String,
        title: Localized.fromJson(j['title'] as Json),
        subtitle: Localized.fromJson(j['subtitle'] as Json),
      );
}

/// Whole-bundle toggle. The wire value is the enum name.
enum BundleStructure { islamic, conventional }

class BundleItem {
  const BundleItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.description,
    required this.monthlyFils,
    required this.countsTowardDbr,
    required this.placeholder,
    this.href,
    this.structure,
    this.financedFils,
    this.tenureMonths,
    this.costOfFinanceFils,
    this.cardId,
    this.annualFeeFils,
    this.cardLimitFils,
  });

  final String id;
  final String kind;
  final Localized title;
  final Localized description;
  final int monthlyFils;
  final bool countsTowardDbr;
  final bool placeholder;
  final String? href;
  final FinanceStructure? structure;
  final int? financedFils;
  final int? tenureMonths;
  final int? costOfFinanceFils;
  final String? cardId;
  final int? annualFeeFils;
  final int? cardLimitFils;

  bool get isIslamic => structure != null && structure != FinanceStructure.conventional;

  factory BundleItem.fromJson(Json j) => BundleItem(
        id: j['id'] as String,
        kind: j['kind'] as String,
        title: Localized.fromJson(j['title'] as Json),
        description: Localized.fromJson(j['description'] as Json),
        monthlyFils: j['monthlyFils'] as int,
        countsTowardDbr: j['countsTowardDbr'] as bool,
        placeholder: j['placeholder'] as bool,
        href: j['href'] as String?,
        structure: j['structure'] == null ? null : FinanceStructure.values.byName(j['structure'] as String),
        financedFils: j['financedFils'] as int?,
        tenureMonths: j['tenureMonths'] as int?,
        costOfFinanceFils: j['costOfFinanceFils'] as int?,
        cardId: j['cardId'] as String?,
        annualFeeFils: j['annualFeeFils'] as int?,
        cardLimitFils: j['cardLimitFils'] as int?,
      );
}

class LifeEventBundle {
  const LifeEventBundle({
    required this.event,
    required this.structure,
    required this.items,
    required this.totalMonthlyFils,
    required this.otherMonthlyFils,
    required this.maxMonthlyFils,
    required this.headroomAfterFils,
    required this.fits,
    required this.shortfallFils,
  });

  final LifeEvent event;
  final BundleStructure structure;
  final List<BundleItem> items;
  final int totalMonthlyFils;
  final int otherMonthlyFils;
  final int maxMonthlyFils;
  final int headroomAfterFils;
  final bool fits;
  final int shortfallFils;

  factory LifeEventBundle.fromJson(Json j) => LifeEventBundle(
        event: LifeEvent.fromJson(j['event'] as Json),
        structure: BundleStructure.values.byName(j['structure'] as String),
        items: [for (final i in j['items'] as List) BundleItem.fromJson(i as Json)],
        totalMonthlyFils: j['totalMonthlyFils'] as int,
        otherMonthlyFils: j['otherMonthlyFils'] as int,
        maxMonthlyFils: j['maxMonthlyFils'] as int,
        headroomAfterFils: j['headroomAfterFils'] as int,
        fits: j['verdict'] == 'fits',
        shortfallFils: j['shortfallFils'] as int,
      );
}

class SettlementLine {
  const SettlementLine(this.kind, this.amountFils);

  /// remaining_principal, settlement_fee, remaining_sale_price, ibra_rebate or remaining_asset_cost
  final String kind;

  /// Negative for deductions (the Ibra' rebate)
  final int amountFils;

  factory SettlementLine.fromJson(Json j) => SettlementLine(j['kind'] as String, j['amountFils'] as int);
}

class SettlementQuote {
  const SettlementQuote({
    required this.contractId,
    required this.structure,
    required this.installmentsRemaining,
    required this.remainingScheduledFils,
    required this.lines,
    required this.settlementAmountFils,
    required this.savingsFils,
    required this.validUntil,
    required this.paymentPurpose,
    required this.paymentReference,
  });

  final String contractId;
  final FinanceStructure structure;
  final int installmentsRemaining;
  final int remainingScheduledFils;
  final List<SettlementLine> lines;
  final int settlementAmountFils;
  final int savingsFils;
  final DateTime validUntil;
  final String paymentPurpose;
  final String paymentReference;

  factory SettlementQuote.fromJson(Json j) {
    final payment = j['payment'] as Json;
    return SettlementQuote(
      contractId: j['contractId'] as String,
      structure: FinanceStructure.values.byName(j['structure'] as String),
      installmentsRemaining: j['installmentsRemaining'] as int,
      remainingScheduledFils: j['remainingScheduledFils'] as int,
      lines: [for (final l in j['lines'] as List) SettlementLine.fromJson(l as Json)],
      settlementAmountFils: j['settlementAmountFils'] as int,
      savingsFils: j['savingsFils'] as int,
      validUntil: DateTime.parse(j['validUntil'] as String),
      paymentPurpose: payment['purpose'] as String,
      paymentReference: payment['reference'] as String,
    );
  }
}
