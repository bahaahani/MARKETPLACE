'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ASSISTANT_MAX_INPUT_CHARS, type AssistantPersona, type AssistantReply } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { AssistantAvatar, AssistantReplyView } from './AssistantReplyView';

type Turn = { role: 'user'; text: string; id: number } | { role: 'assistant'; reply: AssistantReply; id: number };

/** Staff areas (dealer portal, back office) have no customer assistant. */
const STAFF_AREA = /^\/(en|ar)\/(dealer|backoffice|back-office|admin)(\/|$)/;
const PERSONA_KEY = 'sahel.assistant.persona';

const STARTERS: MessageKey[] = ['aiSuggestBalance', 'aiSuggestNext', 'aiSuggestCars', 'aiSuggestPolicies'];

function readPersona(): AssistantPersona {
  try {
    return localStorage.getItem(PERSONA_KEY) === 'suhail' ? 'suhail' : 'suhaila';
  } catch {
    return 'suhaila';
  }
}

/**
 * Suhail & Suhaila 2.0 (idea #5, J8): floating chat button on customer pages and the chat panel.
 * Calls POST /api/v1/assistant/messages (same API as the mobile app). Suggested actions are links to the normal screens,
 * where the customer reviews and confirms; nothing is paid or submitted from the chat.
 */
export function AssistantLauncher({ locale }: { locale: AppLocale }) {
  const pathname = usePathname() ?? '';
  const tr = (k: MessageKey) => t(locale, k);
  const [open, setOpen] = useState(false);
  const [persona, setPersona] = useState<AssistantPersona>('suhaila');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const seq = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => setPersona(readPersona()), []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, busy]);

  if (STAFF_AREA.test(pathname)) return null;

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function choosePersona(p: AssistantPersona) {
    setPersona(p);
    try {
      localStorage.setItem(PERSONA_KEY, p);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }

  async function send(message: string) {
    const body = message.trim();
    if (!body || busy) return;
    setError(null);
    setText('');
    setTurns((ts) => [...ts, { role: 'user', text: body, id: ++seq.current }]);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/assistant/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body, locale, persona }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: { code?: string } }).error?.code;
        setError(res.status === 429 ? 'aiErrorRateLimit' : code === 'TEXT_TOO_LONG' ? 'aiErrorTooLong' : 'aiErrorGeneric');
        return;
      }
      const { data } = (await res.json()) as { data: AssistantReply };
      setTurns((ts) => [...ts, { role: 'assistant', reply: data, id: ++seq.current }]);
    } catch {
      setError('aiErrorGeneric');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const lastReply = [...turns].reverse().find((x): x is Extract<Turn, { role: 'assistant' }> => x.role === 'assistant')?.reply;
  const suggestions = lastReply ? lastReply.suggestions : STARTERS.map((k) => tr(k));
  const personaName = tr(persona === 'suhail' ? 'aiPersonaSuhail' : 'aiPersonaSuhaila');

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={tr('aiOpen')}
        className="fixed bottom-4 end-4 z-30 flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-brand px-3 font-semibold text-white shadow-lg hover:bg-brand-dark md:px-4"
        data-testid="assistant-launcher"
      >
        <span aria-hidden>💬</span>
        <span className="hidden md:inline" aria-hidden>
          {tr('aiOpen')}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          className="card fixed bottom-20 end-4 z-30 flex max-h-[min(70vh,40rem)] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden shadow-2xl"
          data-testid="assistant-panel"
        >
          <header className="flex items-center gap-2 border-b border-border bg-brand-soft px-3 py-2">
            <AssistantAvatar persona={persona} locale={locale} />
            <h2 id={titleId} className="flex-1 font-semibold">
              {tr('aiTitle')}
            </h2>
            <div role="group" aria-label={tr('aiPersonaLabel')} className="flex gap-1 text-xs">
              {(['suhail', 'suhaila'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={persona === p}
                  onClick={() => choosePersona(p)}
                  className={`rounded-full border px-2 py-1 ${persona === p ? 'border-brand bg-brand text-white' : 'border-border bg-surface'}`}
                  data-testid={`assistant-persona-${p}`}
                >
                  {tr(p === 'suhail' ? 'aiPersonaSuhail' : 'aiPersonaSuhaila')}
                </button>
              ))}
            </div>
            <button type="button" onClick={close} className="rounded-md px-2 py-1 text-lg leading-none" aria-label={tr('aiClose')} data-testid="assistant-close">
              ×
            </button>
          </header>

          <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            <div className="flex gap-2">
              <AssistantAvatar persona={persona} locale={locale} />
              <p className="rounded-lg bg-background p-2" data-testid="assistant-greeting">
                {tr(persona === 'suhail' ? 'aiGreetingSuhail' : 'aiGreetingSuhaila')}
              </p>
            </div>
            {turns.map((turn) =>
              turn.role === 'user' ? (
                <div key={turn.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-line rounded-lg bg-brand px-3 py-2 text-white" dir="auto" data-testid="assistant-msg-user">
                    <span className="sr-only">{tr('aiYou')}: </span>
                    {turn.text}
                  </p>
                </div>
              ) : (
                <div key={turn.id} className="flex gap-2" data-testid="assistant-msg-assistant">
                  <AssistantAvatar persona={turn.reply.persona} locale={locale} />
                  <div className="min-w-0 flex-1 rounded-lg bg-background p-2">
                    <span className="sr-only">{turn.reply.personaName}: </span>
                    <AssistantReplyView reply={turn.reply} locale={locale} onAction={() => setOpen(false)} />
                  </div>
                </div>
              ),
            )}
            {busy && (
              <p className="text-xs text-text-muted" role="status" data-testid="assistant-typing">
                {personaName} · {tr('aiTyping')}
              </p>
            )}
            {error && (
              <p className="text-xs text-danger" role="alert" data-testid="assistant-error">
                {tr(error)}
              </p>
            )}
          </div>

          <div className="border-t border-border p-3">
            <ul className="mb-2 flex flex-wrap gap-1" aria-label={tr('aiSuggestionsLabel')}>
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    disabled={busy}
                    className="rounded-full border border-brand px-2.5 py-1 text-xs text-brand hover:bg-brand-soft"
                    dir="auto"
                    data-testid="assistant-suggestion"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
            >
              <label className="flex-1">
                <span className="sr-only">{tr('aiInputLabel')}</span>
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(text);
                    }
                  }}
                  rows={1}
                  maxLength={ASSISTANT_MAX_INPUT_CHARS}
                  dir="auto"
                  placeholder={tr('aiInputPlaceholder')}
                  className="w-full resize-none rounded-md border border-border px-3 py-2"
                  data-testid="assistant-input"
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()} data-testid="assistant-send">
                {tr('aiSend')}
              </button>
            </form>
            <p className="mt-2 text-[11px] text-text-muted" data-testid="assistant-confirm-note">
              {tr('aiConfirmNote')} {tr('aiSandboxNote')}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
