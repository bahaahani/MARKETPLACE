// Models mirror the JSON contract of the shared API (api/openapi.yaml), which the
// Next.js web app also uses. Money is always integer fils (1 BHD = 1000 fils).

typedef Json = Map<String, dynamic>;

class Localized {
  const Localized(this.en, this.ar);
  final String en;
  final String ar;

  factory Localized.fromJson(Json j) => Localized(j['en'] as String, j['ar'] as String);

  String of(String languageCode) => languageCode == 'ar' ? ar : en;
}

class Seller {
  const Seller({required this.id, required this.name, required this.type});
  final String id;
  final Localized name;
  final String type;

  factory Seller.fromJson(Json j) =>
      Seller(id: j['id'] as String, name: Localized.fromJson(j['name'] as Json), type: j['type'] as String);
}

class Vehicle {
  const Vehicle({
    required this.id,
    required this.make,
    required this.model,
    required this.trim,
    required this.year,
    required this.condition,
    required this.mileageKm,
    required this.priceFils,
    required this.bodyType,
    required this.fuel,
    required this.seats,
    required this.color,
    required this.seller,
    required this.inspected,
    required this.accentHue,
    required this.fromMonthlyFils,
  });

  final String id;
  final String make;
  final String model;
  final String trim;
  final int year;
  final String condition;
  final int mileageKm;
  final int priceFils;
  final String bodyType;
  final String fuel;
  final int seats;
  final Localized color;
  final Seller seller;
  final bool inspected;
  final int accentHue;
  final int fromMonthlyFils;

  String get title => '$make $model';
  bool get isNew => condition == 'new';

  factory Vehicle.fromJson(Json j) => Vehicle(
        id: j['id'] as String,
        make: j['make'] as String,
        model: j['model'] as String,
        trim: j['trim'] as String,
        year: j['year'] as int,
        condition: j['condition'] as String,
        mileageKm: j['mileageKm'] as int,
        priceFils: j['priceFils'] as int,
        bodyType: j['bodyType'] as String,
        fuel: j['fuel'] as String,
        seats: j['seats'] as int,
        color: Localized.fromJson(j['color'] as Json),
        seller: Seller.fromJson(j['seller'] as Json),
        inspected: j['inspected'] as bool,
        accentHue: j['accentHue'] as int,
        fromMonthlyFils: j['fromMonthlyFils'] as int,
      );
}

class Property {
  const Property({
    required this.id,
    required this.title,
    required this.area,
    required this.type,
    required this.purpose,
    required this.priceFils,
    required this.bedrooms,
    required this.bathrooms,
    required this.sizeSqm,
    required this.seller,
    required this.valued,
    required this.accentHue,
    required this.fromMonthlyFils,
  });

  final String id;
  final Localized title;
  final Localized area;
  final String type;
  final String purpose;
  final int priceFils;
  final int bedrooms;
  final int bathrooms;
  final int sizeSqm;
  final Seller seller;
  final bool valued;
  final int accentHue;
  final int fromMonthlyFils;

  bool get forSale => purpose == 'sale';

  factory Property.fromJson(Json j) => Property(
        id: j['id'] as String,
        title: Localized.fromJson(j['title'] as Json),
        area: Localized.fromJson(j['area'] as Json),
        type: j['type'] as String,
        purpose: j['purpose'] as String,
        priceFils: j['priceFils'] as int,
        bedrooms: j['bedrooms'] as int,
        bathrooms: j['bathrooms'] as int,
        sizeSqm: j['sizeSqm'] as int,
        seller: Seller.fromJson(j['seller'] as Json),
        valued: j['valued'] as bool,
        accentHue: j['accentHue'] as int,
        fromMonthlyFils: j['fromMonthlyFils'] as int,
      );
}

class CardProduct {
  const CardProduct({
    required this.id,
    required this.name,
    required this.tier,
    required this.annualFeeFils,
    required this.minSalaryFils,
    required this.highlights,
    required this.gradient,
    this.eligible = false,
    this.ineligibleReason,
    this.offeredLimitFils = 0,
  });

  final String id;
  final Localized name;
  final String tier;
  final int annualFeeFils;
  final int minSalaryFils;
  final List<Localized> highlights;
  final List<String> gradient;

  /// The API's eligibility decision for the current customer (same rules as card apply).
  final bool eligible;

  /// BELOW_MIN_SALARY or NO_DBR_HEADROOM when not eligible.
  final String? ineligibleReason;

  /// Limit the card would be issued with (0 for prepaid or when not eligible).
  final int offeredLimitFils;

  factory CardProduct.fromJson(Json j) => CardProduct(
        id: j['id'] as String,
        name: Localized.fromJson(j['name'] as Json),
        tier: j['tier'] as String,
        annualFeeFils: j['annualFeeFils'] as int,
        minSalaryFils: j['minSalaryFils'] as int,
        highlights: [for (final h in j['highlights'] as List) Localized.fromJson(h as Json)],
        gradient: [for (final g in j['gradient'] as List) g as String],
        eligible: j['eligible'] as bool? ?? false,
        ineligibleReason: j['ineligibleReason'] as String?,
        offeredLimitFils: j['offeredLimitFils'] as int? ?? 0,
      );
}

enum FinanceStructure { conventional, murabaha, ijara }

class FinanceQuote {
  const FinanceQuote({
    required this.structure,
    this.assetPriceFils = 0,
    this.downPaymentFils = 0,
    required this.financedFils,
    required this.tenureMonths,
    required this.monthlyFils,
    required this.totalPayableFils,
    required this.costOfFinanceFils,
    required this.ratePct,
    required this.rateBasis,
    required this.aprPct,
    this.salePriceFils,
  });

  final FinanceStructure structure;
  final int assetPriceFils;
  final int downPaymentFils;
  final int financedFils;
  final int tenureMonths;
  final int monthlyFils;
  final int totalPayableFils;
  final int costOfFinanceFils;
  final num ratePct;
  final String rateBasis;
  final num aprPct;
  final int? salePriceFils;

  bool get isIslamic => structure != FinanceStructure.conventional;

  factory FinanceQuote.fromJson(Json j) => FinanceQuote(
        structure: FinanceStructure.values.byName(j['structure'] as String),
        assetPriceFils: j['assetPriceFils'] as int? ?? 0,
        downPaymentFils: j['downPaymentFils'] as int? ?? 0,
        financedFils: j['financedFils'] as int,
        tenureMonths: j['tenureMonths'] as int,
        monthlyFils: j['monthlyFils'] as int,
        totalPayableFils: j['totalPayableFils'] as int,
        costOfFinanceFils: j['costOfFinanceFils'] as int,
        ratePct: j['ratePct'] as num,
        rateBasis: j['rateBasis'] as String,
        aprPct: j['aprPct'] as num,
        salePriceFils: j['salePriceFils'] as int?,
      );
}

class FinanceLimits {
  const FinanceLimits({
    required this.minTenureMonths,
    required this.maxTenureMonths,
    required this.minDownPaymentFils,
    required this.maxDownPaymentFils,
    required this.downPaymentStepFils,
    required this.tenureStepMonths,
    required this.defaultDownPaymentFils,
    required this.defaultTenureMonths,
  });

  final int minTenureMonths;
  final int maxTenureMonths;
  final int minDownPaymentFils;
  final int maxDownPaymentFils;

  /// Slider steps and listing defaults, from the API (never hard-coded in the app).
  final int downPaymentStepFils;
  final int tenureStepMonths;
  final int defaultDownPaymentFils;
  final int defaultTenureMonths;

  factory FinanceLimits.fromJson(Json j) => FinanceLimits(
        minTenureMonths: j['minTenureMonths'] as int,
        maxTenureMonths: j['maxTenureMonths'] as int,
        minDownPaymentFils: j['minDownPaymentFils'] as int,
        maxDownPaymentFils: j['maxDownPaymentFils'] as int,
        downPaymentStepFils: j['downPaymentStepFils'] as int,
        tenureStepMonths: j['tenureStepMonths'] as int,
        defaultDownPaymentFils: j['defaultDownPaymentFils'] as int,
        defaultTenureMonths: j['defaultTenureMonths'] as int,
      );
}

class FinanceComparison {
  const FinanceComparison(this.quotes, this.limits);
  final List<FinanceQuote> quotes;
  final FinanceLimits limits;

  factory FinanceComparison.fromJson(Json j) => FinanceComparison(
        [for (final q in j['quotes'] as List) FinanceQuote.fromJson(q as Json)],
        FinanceLimits.fromJson(j['limits'] as Json),
      );
}

class MotorQuote {
  const MotorQuote({
    required this.insurerId,
    required this.insurerName,
    required this.takaful,
    required this.annualPremiumFils,
    required this.roadsideAssistance,
    required this.agencyRepair,
  });

  final String insurerId;
  final Localized insurerName;
  final bool takaful;
  final int annualPremiumFils;
  final bool roadsideAssistance;
  final bool agencyRepair;

  factory MotorQuote.fromJson(Json j) => MotorQuote(
        insurerId: j['insurerId'] as String,
        insurerName: Localized.fromJson(j['insurerName'] as Json),
        takaful: j['takaful'] as bool,
        annualPremiumFils: j['annualPremiumFils'] as int,
        roadsideAssistance: j['roadsideAssistance'] as bool,
        agencyRepair: j['agencyRepair'] as bool,
      );
}

class Installment {
  const Installment({required this.number, required this.dueDate, required this.amountFils, required this.status});
  final int number;
  final DateTime dueDate;
  final int amountFils;
  final String status;

  factory Installment.fromJson(Json j) => Installment(
        number: j['number'] as int,
        dueDate: DateTime.parse(j['dueDate'] as String),
        amountFils: j['amountFils'] as int,
        status: j['status'] as String,
      );
}

class Contract {
  const Contract({
    required this.id,
    required this.title,
    required this.structure,
    required this.outstandingFils,
    required this.autopay,
    this.nextInstallment,
    this.settlement,
  });

  final String id;
  final Localized title;
  final FinanceStructure structure;
  final int outstandingFils;
  final bool autopay;
  final Installment? nextInstallment;

  /// Set by the API once a captured early-settlement payment closed the contract.
  final ContractSettlement? settlement;

  factory Contract.fromJson(Json j) => Contract(
        id: j['id'] as String,
        title: Localized.fromJson(j['title'] as Json),
        structure: FinanceStructure.values.byName(j['structure'] as String),
        outstandingFils: j['outstandingFils'] as int,
        autopay: j['autopay'] as bool,
        nextInstallment: j['nextInstallment'] == null ? null : Installment.fromJson(j['nextInstallment'] as Json),
        settlement: j['settlement'] == null ? null : ContractSettlement.fromJson(j['settlement'] as Json),
      );
}

class ContractSettlement {
  const ContractSettlement({required this.paymentId, required this.amountFils, required this.settledOn});

  final String paymentId;
  final int amountFils;

  /// Bahrain calendar date, from the API.
  final DateTime settledOn;

  factory ContractSettlement.fromJson(Json j) => ContractSettlement(
        paymentId: j['paymentId'] as String,
        amountFils: j['amountFils'] as int,
        settledOn: DateTime.parse(j['settledOn'] as String),
      );
}

class GarageVehicle {
  const GarageVehicle({
    required this.vehicleId,
    required this.title,
    required this.plate,
    required this.registrationExpiry,
    required this.insuranceExpiry,
    required this.odometerKm,
  });

  final String vehicleId;
  final String title;
  final String plate;
  final DateTime registrationExpiry;
  final DateTime insuranceExpiry;
  final int odometerKm;

  factory GarageVehicle.fromJson(Json j) => GarageVehicle(
        vehicleId: j['vehicleId'] as String,
        title: j['title'] as String,
        plate: j['plate'] as String,
        registrationExpiry: DateTime.parse(j['registrationExpiry'] as String),
        insuranceExpiry: DateTime.parse(j['insuranceExpiry'] as String),
        odometerKm: j['odometerKm'] as int,
      );
}

class PreApprovalLimit {
  const PreApprovalLimit(this.productLine, this.maxFinanceFils);
  final String productLine;
  final int maxFinanceFils;

  factory PreApprovalLimit.fromJson(Json j) => PreApprovalLimit(j['productLine'] as String, j['maxFinanceFils'] as int);
}

class PreApproval {
  const PreApproval({required this.maxMonthlyFils, required this.limits, required this.cardLimitFils, required this.validUntil});
  final int maxMonthlyFils;
  final List<PreApprovalLimit> limits;
  final int cardLimitFils;
  final DateTime validUntil;

  factory PreApproval.fromJson(Json j) => PreApproval(
        maxMonthlyFils: j['maxMonthlyFils'] as int,
        limits: [for (final l in j['limits'] as List) PreApprovalLimit.fromJson(l as Json)],
        cardLimitFils: j['cardLimitFils'] as int,
        validUntil: DateTime.parse(j['validUntil'] as String),
      );
}

class CustomerOverview {
  const CustomerOverview({
    required this.name,
    required this.monthlySalaryFils,
    required this.preApproval,
    required this.contracts,
    required this.garage,
    required this.rewardsPoints,
    this.onboarded = false,
  });

  final Localized name;
  final int monthlySalaryFils;
  final PreApproval preApproval;
  final List<Contract> contracts;
  final List<GarageVehicle> garage;
  final int rewardsPoints;

  /// false while the (sandbox) session is still the demo customer.
  final bool onboarded;

  factory CustomerOverview.fromJson(Json j) => CustomerOverview(
        name: Localized.fromJson(j['name'] as Json),
        monthlySalaryFils: j['monthlySalaryFils'] as int,
        preApproval: PreApproval.fromJson(j['preApproval'] as Json),
        contracts: [for (final c in j['contracts'] as List) Contract.fromJson(c as Json)],
        garage: [for (final g in j['garage'] as List) GarageVehicle.fromJson(g as Json)],
        rewardsPoints: j['rewardsPoints'] as int,
        onboarded: j['onboarded'] as bool? ?? false,
      );
}

enum PaymentMethod {
  benefitpay('benefitpay'),
  applePay('apple_pay'),
  googlePay('google_pay'),
  samsungPay('samsung_pay'),
  clickToPay('click_to_pay'),
  card('card');

  const PaymentMethod(this.wire);
  final String wire;
}

class Payment {
  const Payment({required this.id, required this.status, required this.amountFils});
  final String id;
  final String status;
  final int amountFils;

  factory Payment.fromJson(Json j) =>
      Payment(id: j['id'] as String, status: j['status'] as String, amountFils: j['amountFils'] as int);
}

/// Credit decision on a finance application. Rules run server-side (packages/domain/src/origination.ts).
class ApplicationDecision {
  const ApplicationDecision({
    required this.outcome,
    required this.reasons,
    required this.monthlyFils,
    required this.maxMonthlyFils,
    required this.dbrCapPct,
    required this.preApprovedLimitFils,
  });

  /// APPROVED, REFERRED or DECLINED
  final String outcome;

  /// OK, DBR_EXCEEDED, AMOUNT_ABOVE_PREAPPROVAL, HIGH_DBR_UTILISATION
  final List<String> reasons;
  final int monthlyFils;
  final int maxMonthlyFils;
  final num dbrCapPct;
  final int preApprovedLimitFils;

  factory ApplicationDecision.fromJson(Json j) => ApplicationDecision(
        outcome: j['outcome'] as String,
        reasons: [for (final r in j['reasons'] as List) r as String],
        monthlyFils: j['monthlyFils'] as int,
        maxMonthlyFils: j['maxMonthlyFils'] as int,
        dbrCapPct: j['dbrCapPct'] as num,
        preApprovedLimitFils: j['preApprovedLimitFils'] as int,
      );
}

/// One timeline step, in the order the API returns them (done steps first, then steps to come).
class ApplicationStep {
  const ApplicationStep({required this.status, required this.done, required this.murabaha, this.ijara = false, this.at, this.by});
  final String status;
  final bool done;

  /// Part of the Murabaha sequence: BCFC buys, owns, then sells the asset.
  final bool murabaha;

  /// Part of the Ijara Muntahia Bittamleek sequence: BCFC buys, leases, then ownership passes after the final rental.
  final bool ijara;
  final DateTime? at;

  /// CREDIT_OFFICER when a credit officer made this step (reviewed a referred application)
  final String? by;

  bool get reviewedByOfficer => by == 'CREDIT_OFFICER';

  factory ApplicationStep.fromJson(Json j) => ApplicationStep(
        status: j['status'] as String,
        done: j['done'] as bool,
        murabaha: j['murabaha'] as bool,
        ijara: j['ijara'] as bool? ?? false,
        at: j['at'] == null ? null : DateTime.parse(j['at'] as String),
        by: j['by'] as String?,
      );
}

/// A credit officer's decision on a referred application (the officer's note stays internal to the back office).
class CreditReview {
  const CreditReview({required this.outcome, required this.reviewedAt});

  /// APPROVED or DECLINED
  final String outcome;
  final DateTime reviewedAt;

  factory CreditReview.fromJson(Json j) => CreditReview(
        outcome: j['outcome'] as String,
        reviewedAt: DateTime.parse(j['reviewedAt'] as String),
      );
}

class FinanceApplication {
  const FinanceApplication({
    required this.id,
    required this.productLine,
    required this.structure,
    required this.quote,
    required this.reference,
    required this.status,
    required this.steps,
    this.decision,
    this.review,
    this.nextAction,
  });

  final String id;
  final String productLine;
  final FinanceStructure structure;
  final FinanceQuote quote;

  /// Vehicle id for cars, property id for home finance, "personal" for personal finance
  final String reference;
  final String status;
  final List<ApplicationStep> steps;
  final ApplicationDecision? decision;

  /// Present once a credit officer decided a referred application
  final CreditReview? review;

  /// What to show: the credit officer's outcome when reviewed, else the automatic decision.
  String? get outcome => review?.outcome ?? decision?.outcome;

  /// What the customer must do before fulfilment continues (e.g. pay the valuation fee), from the API.
  final ApplicationNextAction? nextAction;

  bool get canAccept => status == 'APPROVED';

  factory FinanceApplication.fromJson(Json j) => FinanceApplication(
        id: j['id'] as String,
        productLine: j['productLine'] as String,
        structure: FinanceStructure.values.byName(j['structure'] as String),
        quote: FinanceQuote.fromJson(j['quote'] as Json),
        reference: j['reference'] as String,
        status: j['status'] as String,
        steps: [for (final s in j['steps'] as List) ApplicationStep.fromJson(s as Json)],
        decision: j['decision'] == null ? null : ApplicationDecision.fromJson(j['decision'] as Json),
        review: j['review'] == null ? null : CreditReview.fromJson(j['review'] as Json),
        nextAction: j['nextAction'] == null ? null : ApplicationNextAction.fromJson(j['nextAction'] as Json),
      );
}

/// A payment the customer must make before the application continues (home finance: the TRESCO valuation fee).
/// The amount comes from GET /payments/price.
class ApplicationNextAction {
  const ApplicationNextAction({required this.type, required this.purpose, required this.reference, this.feePaid = false});

  /// PAY_VALUATION_FEE
  final String type;
  final String purpose;
  final String reference;

  /// True once the server sees the customer's captured fee: show "Continue" instead of "Pay valuation fee".
  final bool feePaid;

  factory ApplicationNextAction.fromJson(Json j) => ApplicationNextAction(
        type: j['type'] as String,
        purpose: j['purpose'] as String,
        reference: j['reference'] as String,
        feePaid: j['feePaid'] as bool? ?? false,
      );
}

// ---- Onboarding (journey J1). ⚠️ Sandbox: eKey, CRB and Open Banking are simulated by the API.

class EKeyIdentity {
  const EKeyIdentity({required this.name, required this.cprMasked, required this.nationality, required this.provider});
  final Localized name;

  /// Last 3 digits only; the API never returns the full CPR.
  final String cprMasked;
  final Localized nationality;
  final String provider;

  factory EKeyIdentity.fromJson(Json j) => EKeyIdentity(
        name: Localized.fromJson(j['name'] as Json),
        cprMasked: j['cprMasked'] as String,
        nationality: Localized.fromJson(j['nationality'] as Json),
        provider: j['provider'] as String,
      );
}

class ConsentRecord {
  const ConsentRecord({required this.scopes, required this.grantedAt, required this.expiresAt});
  final List<String> scopes;
  final DateTime grantedAt;
  final DateTime expiresAt;

  factory ConsentRecord.fromJson(Json j) => ConsentRecord(
        scopes: [for (final s in j['scopes'] as List) s as String],
        grantedAt: DateTime.parse(j['grantedAt'] as String),
        expiresAt: DateTime.parse(j['expiresAt'] as String),
      );
}

class OnboardingResult {
  const OnboardingResult({required this.preApproval, required this.consent});
  final PreApproval preApproval;
  final ConsentRecord consent;

  factory OnboardingResult.fromJson(Json j) => OnboardingResult(
        preApproval: PreApproval.fromJson(j['preApproval'] as Json),
        consent: ConsentRecord.fromJson(j['consent'] as Json),
      );
}

// ---- Instant card (journey J3). ⚠️ Sandbox: no processor; the number is always masked.

class WalletProvisioning {
  const WalletProvisioning({required this.applePay, required this.googlePay, required this.samsungPay});
  final bool applePay;
  final bool googlePay;
  final bool samsungPay;

  factory WalletProvisioning.fromJson(Json j) => WalletProvisioning(
        applePay: j['applePay'] as bool,
        googlePay: j['googlePay'] as bool,
        samsungPay: j['samsungPay'] as bool,
      );
}

class VirtualCard {
  const VirtualCard({
    required this.id,
    required this.cardId,
    required this.name,
    required this.panMasked,
    required this.expiry,
    required this.status,
    required this.limitFils,
    required this.gradient,
    required this.wallet,
  });

  final String id;
  final String cardId;
  final Localized name;

  /// "5xxx xxxx xxxx 1234": a full PAN or CVV never reaches the app.
  final String panMasked;
  final String expiry;
  final String status;
  final int limitFils;
  final List<String> gradient;
  final WalletProvisioning wallet;

  factory VirtualCard.fromJson(Json j) => VirtualCard(
        id: j['id'] as String,
        cardId: j['cardId'] as String,
        name: Localized.fromJson(j['name'] as Json),
        panMasked: j['panMasked'] as String,
        expiry: j['expiry'] as String,
        status: j['status'] as String,
        limitFils: j['limitFils'] as int,
        gradient: [for (final g in j['gradient'] as List) g as String],
        wallet: WalletProvisioning.fromJson(j['wallet'] as Json),
      );
}

class CardApplication {
  const CardApplication({required this.decision, required this.cardId, this.virtualCard, this.reason});
  final String decision;
  final String cardId;
  final VirtualCard? virtualCard;
  final String? reason;

  bool get approved => decision == 'APPROVED';

  factory CardApplication.fromJson(Json j) => CardApplication(
        decision: j['decision'] as String,
        cardId: j['cardId'] as String,
        virtualCard: j['virtualCard'] == null ? null : VirtualCard.fromJson(j['virtualCard'] as Json),
        reason: j['reason'] as String?,
      );
}

/// Short-lived code the customer shows a dealer (POST /me/preapproval-token). The dealer redeems it
/// for first name and limits only, never salary or CPR.
class PreApprovalShare {
  const PreApprovalShare({required this.token, required this.expiresAt, required this.ttlSeconds});
  final String token;
  final DateTime expiresAt;
  final int ttlSeconds;

  factory PreApprovalShare.fromJson(Json j) => PreApprovalShare(
        token: j['token'] as String,
        expiresAt: DateTime.parse(j['expiresAt'] as String),
        ttlSeconds: j['ttlSeconds'] as int,
      );
}
