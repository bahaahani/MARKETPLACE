import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme/tokens.g.dart';
import 'assistant_controller.dart';
import 'assistant_models.dart';

/// Opens a suggested action. Paths inside the bottom-navigation shell (cars, property, cards, account) are
/// opened with `go` (switching tab), because pushing a shell route over this full-screen route is not supported;
/// the others (checkout, finance, insurance, onboarding) are pushed, so Back returns to the chat.
void openAssistantLink(BuildContext context, String href) {
  final shell = RegExp(r'^/(cars|property|cards|account)?([/?]|$)').hasMatch(href);
  shell ? context.go(href) : context.push(href);
}

/// Suhail & Suhaila 2.0 (idea #5, J8). Same behaviour as the web chat panel: answers come from
/// POST /api/v1/assistant/messages; suggested actions open the normal screens (checkout, listing, account),
/// where the customer reviews and confirms. Nothing is paid or submitted from the chat.
class AssistantScreen extends ConsumerStatefulWidget {
  const AssistantScreen({super.key});

  @override
  ConsumerState<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends ConsumerState<AssistantScreen> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    _input.clear();
    await ref.read(assistantProvider.notifier).send(text, locale: context.lang);
    if (!mounted) return;
    _focus.requestFocus();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = ref.watch(assistantProvider);
    final suggestions = s.lastReply?.suggestions ?? [l.aiSuggestBalance, l.aiSuggestNext, l.aiSuggestCars, l.aiSuggestPolicies];
    final error = switch (s.error) {
      AssistantError.rateLimited => l.aiErrorRateLimit,
      AssistantError.tooLong => l.aiErrorTooLong,
      AssistantError.generic => l.aiErrorGeneric,
      null => null,
    };

    return Scaffold(
      appBar: AppBar(title: Text(l.aiTitle)),
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(SahelSpace.md, SahelSpace.sm, SahelSpace.md, 0),
            child: Row(children: [
              Text(l.aiPersonaLabel),
              const SizedBox(width: SahelSpace.sm),
              Expanded(
                child: SegmentedButton<AssistantPersona>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: AssistantPersona.suhail, label: Text(l.aiPersonaSuhail, key: const Key('assistant-persona-suhail'))),
                    ButtonSegment(value: AssistantPersona.suhaila, label: Text(l.aiPersonaSuhaila, key: const Key('assistant-persona-suhaila'))),
                  ],
                  selected: {s.persona},
                  onSelectionChanged: (v) => ref.read(assistantProvider.notifier).setPersona(v.first),
                ),
              ),
            ]),
          ),
          Expanded(
            child: ListView(
              key: const Key('assistant-log'),
              controller: _scroll,
              padding: const EdgeInsets.all(SahelSpace.md),
              children: [
                _Bubble(
                  persona: s.persona,
                  child: Text(s.persona == AssistantPersona.suhail ? l.aiGreetingSuhail : l.aiGreetingSuhaila, key: const Key('assistant-greeting')),
                ),
                for (final (i, t) in s.turns.indexed)
                  if (t.reply case final reply?)
                    // The newest answer is announced by screen readers.
                    Semantics(liveRegion: i == s.turns.length - 1, child: _Bubble(persona: reply.persona, child: _ReplyView(reply: reply)))
                  else
                    _UserBubble(text: t.text!),
                if (s.busy) Padding(padding: const EdgeInsets.all(SahelSpace.sm), child: Text(l.aiTyping, key: const Key('assistant-typing'))),
                if (error != null)
                  Semantics(
                    liveRegion: true,
                    child: Text(error, key: const Key('assistant-error'), style: const TextStyle(color: SahelColors.danger)),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: SahelSpace.md),
            child: SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final (i, text) in suggestions.indexed)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: SahelSpace.xs),
                      child: ActionChip(key: Key('assistant-suggestion-$i'), label: Text(text), onPressed: s.busy ? null : () => _send(text)),
                    ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(SahelSpace.md, SahelSpace.sm, SahelSpace.md, 0),
            child: Row(children: [
              Expanded(
                child: TextField(
                  key: const Key('assistant-input'),
                  controller: _input,
                  focusNode: _focus,
                  autofocus: true,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: _send,
                  decoration: InputDecoration(labelText: l.aiInputLabel, hintText: l.aiInputPlaceholder, border: const OutlineInputBorder()),
                ),
              ),
              const SizedBox(width: SahelSpace.sm),
              IconButton.filled(
                key: const Key('assistant-send'),
                tooltip: l.aiSend,
                onPressed: s.busy ? null : () => _send(_input.text),
                icon: const Icon(Icons.send),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(SahelSpace.md),
            child: Text('${l.aiConfirmNote} ${l.aiSandboxNote}',
                key: const Key('assistant-confirm-note'), style: const TextStyle(fontSize: 11, color: SahelColors.textMuted)),
          ),
        ]),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.persona});
  final AssistantPersona persona;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final name = persona == AssistantPersona.suhail ? l.aiPersonaSuhail : l.aiPersonaSuhaila;
    return ExcludeSemantics(
      child: CircleAvatar(
        radius: 16,
        backgroundColor: persona == AssistantPersona.suhail ? SahelColors.brand : SahelColors.islamic,
        child: Text(name.characters.first, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.persona, required this.child});
  final AssistantPersona persona;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: SahelSpace.sm),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _Avatar(persona: persona),
          const SizedBox(width: SahelSpace.sm),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(SahelSpace.sm),
              decoration: BoxDecoration(color: SahelColors.background, borderRadius: BorderRadius.circular(SahelRadius.sm)),
              child: child,
            ),
          ),
        ]),
      );
}

class _UserBubble extends StatelessWidget {
  const _UserBubble({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Align(
        alignment: AlignmentDirectional.centerEnd,
        child: Container(
          margin: const EdgeInsets.only(bottom: SahelSpace.sm),
          padding: const EdgeInsets.symmetric(horizontal: SahelSpace.md, vertical: SahelSpace.sm),
          constraints: const BoxConstraints(maxWidth: 320),
          decoration: BoxDecoration(color: SahelColors.brand, borderRadius: BorderRadius.circular(SahelRadius.sm)),
          child: Semantics(label: context.l10n.aiYou, child: Text(text, style: const TextStyle(color: Colors.white))),
        ),
      );
}

/// Text in the answer's own language and direction, then cards and suggested actions.
class _ReplyView extends StatelessWidget {
  const _ReplyView({required this.reply});
  final AssistantReply reply;

  @override
  Widget build(BuildContext context) {
    String money(int fils, {int decimals = 3}) => formatBhd(fils, reply.locale, decimals: decimals);
    return Directionality(
      textDirection: reply.isRtl ? TextDirection.rtl : TextDirection.ltr,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(reply.text, key: Key('assistant-reply-${reply.id}')),
        for (final c in reply.cards)
          Container(
            key: Key('assistant-card-${c.kind}'),
            margin: const EdgeInsets.only(top: SahelSpace.sm),
            padding: const EdgeInsets.all(SahelSpace.sm),
            decoration: BoxDecoration(
              color: SahelColors.surface,
              border: Border.all(color: SahelColors.border),
              borderRadius: BorderRadius.circular(SahelRadius.sm),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.title, style: const TextStyle(fontWeight: FontWeight.w600)),
              for (final r in c.rows)
                Row(children: [
                  Expanded(child: Text(r.label, style: TextStyle(fontWeight: r.emphasis ? FontWeight.bold : null))),
                  Text(
                    r.amountFils < 0 ? '− ${money(-r.amountFils)}' : money(r.amountFils),
                    key: r.emphasis ? const Key('assistant-amount-emphasis') : null,
                    style: TextStyle(fontWeight: r.emphasis ? FontWeight.bold : null, color: r.amountFils < 0 ? SahelColors.islamic : null),
                  ),
                ]),
              for (final v in c.vehicles)
                InkWell(
                  key: Key('assistant-vehicle-${v.id}'),
                  onTap: () => openAssistantLink(context, v.href),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: SahelSpace.xs),
                    child: Row(children: [
                      Expanded(child: Text('${v.title} ${v.year}')),
                      Text(money(v.fromMonthlyFils, decimals: 0), style: const TextStyle(color: SahelColors.brand, fontWeight: FontWeight.w600)),
                    ]),
                  ),
                ),
              for (final x in c.items)
                Padding(
                  padding: const EdgeInsets.only(top: SahelSpace.xs),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(x.title, style: const TextStyle(fontWeight: FontWeight.w500)),
                    Text(x.detail, style: const TextStyle(fontSize: 12, color: SahelColors.textMuted)),
                  ]),
                ),
              if (c.note != null) Text(c.note!, style: const TextStyle(fontSize: 11, color: SahelColors.textMuted)),
            ]),
          ),
        if (reply.actions.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: SahelSpace.sm),
            child: Wrap(spacing: SahelSpace.sm, runSpacing: SahelSpace.xs, children: [
              for (final a in reply.actions)
                a.isPayment
                    ? FilledButton(key: Key('assistant-action-${a.id}'), onPressed: () => openAssistantLink(context, a.href), child: Text(a.label))
                    : OutlinedButton(key: Key('assistant-action-${a.id}'), onPressed: () => openAssistantLink(context, a.href), child: Text(a.label)),
            ]),
          ),
      ]),
    );
  }
}
