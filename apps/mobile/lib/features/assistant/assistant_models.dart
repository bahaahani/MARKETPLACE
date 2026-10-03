// Suhail & Suhaila 2.0: the reply of POST /api/v1/assistant/messages (see AssistantReply in api/openapi.yaml).
// The app only renders it: intents, figures, links and texts all come from the API.

import '../../core/models.dart';

enum AssistantPersona {
  suhail,
  suhaila;

  String get wire => name;
}

class AssistantAmountRow {
  const AssistantAmountRow({required this.label, required this.amountFils, required this.emphasis});
  final String label;
  final int amountFils;
  final bool emphasis;

  factory AssistantAmountRow.fromJson(Json j) =>
      AssistantAmountRow(label: j['label'] as String, amountFils: j['amountFils'] as int, emphasis: j['emphasis'] == true);
}

class AssistantVehicleItem {
  const AssistantVehicleItem({required this.id, required this.title, required this.year, required this.fromMonthlyFils, required this.href});
  final String id;
  final String title;
  final int year;
  final int fromMonthlyFils;
  final String href;

  factory AssistantVehicleItem.fromJson(Json j) => AssistantVehicleItem(
        id: j['id'] as String,
        title: j['title'] as String,
        year: j['year'] as int,
        fromMonthlyFils: j['fromMonthlyFils'] as int,
        href: j['href'] as String,
      );
}

class AssistantListItem {
  const AssistantListItem({required this.title, required this.detail});
  final String title;
  final String detail;

  factory AssistantListItem.fromJson(Json j) => AssistantListItem(title: j['title'] as String, detail: j['detail'] as String);
}

/// `amounts`, `vehicles` or `list`; only the matching field is filled.
class AssistantCard {
  const AssistantCard({required this.kind, required this.title, this.note, this.rows = const [], this.vehicles = const [], this.items = const []});
  final String kind;
  final String title;
  final String? note;
  final List<AssistantAmountRow> rows;
  final List<AssistantVehicleItem> vehicles;
  final List<AssistantListItem> items;

  factory AssistantCard.fromJson(Json j) {
    final kind = j['kind'] as String;
    return AssistantCard(
      kind: kind,
      title: j['title'] as String,
      note: j['note'] as String?,
      rows: [for (final r in (j['rows'] as List?) ?? const []) AssistantAmountRow.fromJson(r as Json)],
      vehicles: kind == 'vehicles' ? [for (final v in j['items'] as List) AssistantVehicleItem.fromJson(v as Json)] : const [],
      items: kind == 'list' ? [for (final v in j['items'] as List) AssistantListItem.fromJson(v as Json)] : const [],
    );
  }
}

/// A suggested link to a normal screen. The assistant never executes it: payments open the checkout.
class AssistantAction {
  const AssistantAction({required this.id, required this.label, required this.href, required this.isPayment});
  final String id;
  final String label;

  /// Locale-free app path; the router's routes mirror the web URLs.
  final String href;
  final bool isPayment;

  factory AssistantAction.fromJson(Json j) =>
      AssistantAction(id: j['id'] as String, label: j['label'] as String, href: j['href'] as String, isPayment: j['kind'] == 'payment');
}

class AssistantReply {
  const AssistantReply({
    required this.id,
    required this.persona,
    required this.personaName,
    required this.locale,
    required this.intent,
    required this.text,
    required this.cards,
    required this.actions,
    required this.suggestions,
    this.handoffReference,
  });

  final String id;
  final AssistantPersona persona;
  final String personaName;

  /// Language of the answer (the language the customer wrote in).
  final String locale;
  final String intent;
  final String text;
  final List<AssistantCard> cards;
  final List<AssistantAction> actions;
  final List<String> suggestions;
  final String? handoffReference;

  bool get isRtl => locale == 'ar';

  factory AssistantReply.fromJson(Json j) => AssistantReply(
        id: j['id'] as String,
        persona: j['persona'] == 'suhail' ? AssistantPersona.suhail : AssistantPersona.suhaila,
        personaName: j['personaName'] as String,
        locale: j['locale'] as String,
        intent: j['intent'] as String,
        text: j['text'] as String,
        cards: [for (final c in j['cards'] as List) AssistantCard.fromJson(c as Json)],
        actions: [for (final a in j['actions'] as List) AssistantAction.fromJson(a as Json)],
        suggestions: [for (final s in j['suggestions'] as List) s as String],
        handoffReference: (j['handoff'] as Json?)?['reference'] as String?,
      );
}
