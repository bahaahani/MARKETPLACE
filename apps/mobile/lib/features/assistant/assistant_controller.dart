import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/providers.dart';
import 'assistant_models.dart';

/// One bubble: the customer's text, or the assistant's reply.
class AssistantTurn {
  const AssistantTurn.user(String this.text) : reply = null;
  const AssistantTurn.assistant(AssistantReply this.reply) : text = null;
  final String? text;
  final AssistantReply? reply;
}

enum AssistantError { rateLimited, tooLong, generic }

class AssistantState {
  const AssistantState({this.turns = const [], this.persona = AssistantPersona.suhaila, this.busy = false, this.error});
  final List<AssistantTurn> turns;
  final AssistantPersona persona;
  final bool busy;
  final AssistantError? error;

  AssistantReply? get lastReply => turns.reversed.map((t) => t.reply).whereType<AssistantReply>().firstOrNull;

  AssistantState copyWith({List<AssistantTurn>? turns, AssistantPersona? persona, bool? busy, AssistantError? error, bool clearError = false}) =>
      AssistantState(
        turns: turns ?? this.turns,
        persona: persona ?? this.persona,
        busy: busy ?? this.busy,
        error: clearError ? null : error ?? this.error,
      );
}

/// The chat state for this app session. The conversation memory itself is kept by the API (per sandbox session);
/// this only holds what is on screen.
class AssistantController extends Notifier<AssistantState> {
  @override
  AssistantState build() => const AssistantState();

  void setPersona(AssistantPersona p) => state = state.copyWith(persona: p);

  Future<void> send(String text, {required String locale}) async {
    final body = text.trim();
    if (body.isEmpty || state.busy) return;
    state = state.copyWith(turns: [...state.turns, AssistantTurn.user(body)], busy: true, clearError: true);
    try {
      final reply = await ref.read(repositoryProvider).sendAssistantMessage(text: body, locale: locale, persona: state.persona);
      state = state.copyWith(turns: [...state.turns, AssistantTurn.assistant(reply)], busy: false);
    } on ApiException catch (e) {
      state = state.copyWith(
        busy: false,
        error: e.statusCode == 429
            ? AssistantError.rateLimited
            : e.code == 'TEXT_TOO_LONG'
                ? AssistantError.tooLong
                : AssistantError.generic,
      );
    } catch (_) {
      state = state.copyWith(busy: false, error: AssistantError.generic);
    }
  }
}

final assistantProvider = NotifierProvider<AssistantController, AssistantState>(AssistantController.new);
