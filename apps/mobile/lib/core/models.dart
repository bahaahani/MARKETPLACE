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
  });

  final String id;
  final Localized name;
  final String tier;
  final int annualFeeFils;
  final int minSalaryFils;
  final List<Localized> highlights;
  final List<String> gradient;

  factory CardProduct.fromJson(Json j) => CardProduct(
        id: j['id'] as String,
        name: Localized.fromJson(j['name'] as Json),
        tier: j['tier'] as String,
        annualFeeFils: j['annualFeeFils'] as int,
        minSalaryFils: j['minSalaryFils'] as int,
        highlights: [for (final h in j['highlights'] as List) Localized.fromJson(h as Json)],
        gradient: [for (final g in j['gradient'] as List) g as String],
      );
}

enum FinanceStructure { conventional, murabaha, ijara }

class FinanceQuote {
  const FinanceQuote({
    required this.structure,
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
  });

  final int minTenureMonths;
  final int maxTenureMonths;
  final int minDownPaymentFils;
  final int maxDownPaymentFils;

  factory FinanceLimits.fromJson(Json j) => FinanceLimits(
        minTenureMonths: j['minTenureMonths'] as int,
        maxTenureMonths: j['maxTenureMonths'] as int,
        minDownPaymentFils: j['minDownPaymentFils'] as int,
        maxDownPaymentFils: j['maxDownPaymentFils'] as int,
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
  });

  final String id;
  final Localized title;
  final FinanceStructure structure;
  final int outstandingFils;
  final bool autopay;
  final Installment? nextInstallment;

  factory Contract.fromJson(Json j) => Contract(
        id: j['id'] as String,
        title: Localized.fromJson(j['title'] as Json),
        structure: FinanceStructure.values.byName(j['structure'] as String),
        outstandingFils: j['outstandingFils'] as int,
        autopay: j['autopay'] as bool,
        nextInstallment: j['nextInstallment'] == null ? null : Installment.fromJson(j['nextInstallment'] as Json),
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
  });

  final Localized name;
  final int monthlySalaryFils;
  final PreApproval preApproval;
  final List<Contract> contracts;
  final List<GarageVehicle> garage;
  final int rewardsPoints;

  factory CustomerOverview.fromJson(Json j) => CustomerOverview(
        name: Localized.fromJson(j['name'] as Json),
        monthlySalaryFils: j['monthlySalaryFils'] as int,
        preApproval: PreApproval.fromJson(j['preApproval'] as Json),
        contracts: [for (final c in j['contracts'] as List) Contract.fromJson(c as Json)],
        garage: [for (final g in j['garage'] as List) GarageVehicle.fromJson(g as Json)],
        rewardsPoints: j['rewardsPoints'] as int,
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
