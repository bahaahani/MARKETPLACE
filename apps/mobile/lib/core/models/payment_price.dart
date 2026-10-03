// Server-priced payments (GET /api/v1/payments/price, api/openapi.yaml). The app never decides these amounts:
// POST /payments refuses any other amount for a server-priced purpose (422 AMOUNT_MISMATCH).

import '../models.dart';

class PaymentPrice {
  const PaymentPrice({required this.purpose, required this.reference, required this.amountFils});

  final String purpose;
  final String reference;
  final int amountFils;

  factory PaymentPrice.fromJson(Json j) =>
      PaymentPrice(purpose: j['purpose'] as String, reference: j['reference'] as String, amountFils: j['amountFils'] as int);
}
