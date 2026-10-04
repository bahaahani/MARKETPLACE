// IMTIAZ Points Everywhere (api/openapi.yaml: RewardsSummary, RewardItem, RewardRedemption).
// ⚠️ Sandbox, placeholder rates. The app computes nothing: balance, tier, progress, history titles, earn rules, costs
// and whether an item is affordable all come from the API (packages/domain/src/rewards.ts).

import '../../core/models.dart';

class RewardsTier {
  const RewardsTier({required this.id, required this.name, required this.minPoints});
  final String id;
  final Localized name;
  final int minPoints;

  factory RewardsTier.fromJson(Json j) =>
      RewardsTier(id: j['id'] as String, name: Localized.fromJson(j['name'] as Json), minPoints: j['minPoints'] as int);
}

class RewardsEntry {
  const RewardsEntry({required this.id, required this.kind, required this.source, required this.points, required this.at, required this.title});
  final String id;

  /// opening, earn, bonus, reversal or burn
  final String kind;
  final String source;

  /// Signed: reversals and burns are negative
  final int points;
  final DateTime at;
  final Localized title;

  factory RewardsEntry.fromJson(Json j) => RewardsEntry(
        id: j['id'] as String,
        kind: j['kind'] as String,
        source: j['source'] as String,
        points: j['points'] as int,
        at: DateTime.parse(j['at'] as String),
        title: Localized.fromJson(j['title'] as Json),
      );
}

class RewardsEarnRule {
  const RewardsEarnRule({required this.id, required this.title, this.pointsPerBhd, this.points});
  final String id;
  final Localized title;
  final int? pointsPerBhd;
  final int? points;

  factory RewardsEarnRule.fromJson(Json j) => RewardsEarnRule(
        id: j['id'] as String,
        title: Localized.fromJson(j['title'] as Json),
        pointsPerBhd: j['pointsPerBhd'] as int?,
        points: j['points'] as int?,
      );
}

/// GET /me/rewards
class RewardsSummary {
  const RewardsSummary({
    required this.balance,
    required this.openingBalance,
    required this.earned,
    required this.burned,
    required this.tier,
    required this.nextTier,
    required this.tierPoints,
    required this.windowFrom,
    required this.pointsToNextTier,
    required this.progressPct,
    required this.entries,
    required this.earnRules,
  });

  final int balance;
  final int openingBalance;
  final int earned;
  final int burned;
  final RewardsTier tier;
  final RewardsTier? nextTier;
  final int tierPoints;
  final DateTime windowFrom;
  final int pointsToNextTier;
  final int progressPct;

  /// Newest first
  final List<RewardsEntry> entries;
  final List<RewardsEarnRule> earnRules;

  factory RewardsSummary.fromJson(Json j) => RewardsSummary(
        balance: j['balance'] as int,
        openingBalance: j['openingBalance'] as int,
        earned: (j['totals'] as Json)['earned'] as int,
        burned: (j['totals'] as Json)['burned'] as int,
        tier: RewardsTier.fromJson(j['tier'] as Json),
        nextTier: j['nextTier'] == null ? null : RewardsTier.fromJson(j['nextTier'] as Json),
        tierPoints: j['tierPoints'] as int,
        windowFrom: DateTime.parse(j['windowFrom'] as String),
        pointsToNextTier: j['pointsToNextTier'] as int,
        progressPct: j['progressPct'] as int,
        entries: [for (final e in j['entries'] as List) RewardsEntry.fromJson(e as Json)],
        earnRules: [for (final r in j['earnRules'] as List) RewardsEarnRule.fromJson(r as Json)],
      );
}

class RewardItem {
  const RewardItem({
    required this.id,
    required this.category,
    required this.name,
    required this.partner,
    required this.description,
    required this.pointsCost,
    required this.valueFils,
    required this.validityDays,
    required this.demoPartner,
    required this.affordable,
  });

  final String id;
  final String category;
  final Localized name;
  final Localized partner;
  final Localized description;
  final int pointsCost;
  final int? valueFils;
  final int validityDays;

  /// ⚠️ Fictional partner or no agreement yet
  final bool demoPartner;

  /// The session customer's balance covers it (the API still checks)
  final bool affordable;

  factory RewardItem.fromJson(Json j) => RewardItem(
        id: j['id'] as String,
        category: j['category'] as String,
        name: Localized.fromJson(j['name'] as Json),
        partner: Localized.fromJson(j['partner'] as Json),
        description: Localized.fromJson(j['description'] as Json),
        pointsCost: j['pointsCost'] as int,
        valueFils: j['valueFils'] as int?,
        validityDays: j['validityDays'] as int,
        demoPartner: j['demoPartner'] as bool,
        affordable: j['affordable'] as bool,
      );
}

/// GET /rewards/catalogue
class RewardsCatalogue {
  const RewardsCatalogue({required this.balance, required this.items});
  final int balance;
  final List<RewardItem> items;

  factory RewardsCatalogue.fromJson(Json j) =>
      RewardsCatalogue(balance: j['balance'] as int, items: [for (final i in j['items'] as List) RewardItem.fromJson(i as Json)]);
}

class RewardRedemption {
  const RewardRedemption({
    required this.id,
    required this.itemId,
    required this.itemName,
    required this.partner,
    required this.pointsCost,
    required this.code,
    required this.codeMasked,
    required this.createdAt,
    required this.expiresOn,
    required this.demoPartner,
  });

  final String id;
  final String itemId;
  final Localized itemName;
  final Localized partner;
  final int pointsCost;

  /// Full code: only in the redemption response, never in lists
  final String? code;
  final String codeMasked;
  final DateTime createdAt;
  final DateTime expiresOn;
  final bool demoPartner;

  factory RewardRedemption.fromJson(Json j) => RewardRedemption(
        id: j['id'] as String,
        itemId: j['itemId'] as String,
        itemName: Localized.fromJson(j['itemName'] as Json),
        partner: Localized.fromJson(j['partner'] as Json),
        pointsCost: j['pointsCost'] as int,
        code: j['code'] as String?,
        codeMasked: j['codeMasked'] as String,
        createdAt: DateTime.parse(j['createdAt'] as String),
        expiresOn: DateTime.parse(j['expiresOn'] as String),
        demoPartner: j['demoPartner'] as bool,
      );
}

/// POST /me/rewards/redemptions
class RedemptionResult {
  const RedemptionResult({required this.redemption, required this.balance, required this.replayed});
  final RewardRedemption redemption;
  final int balance;
  final bool replayed;

  factory RedemptionResult.fromJson(Json j) => RedemptionResult(
        redemption: RewardRedemption.fromJson(j['redemption'] as Json),
        balance: j['balance'] as int,
        replayed: j['replayed'] as bool,
      );
}
