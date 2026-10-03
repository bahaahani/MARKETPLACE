'use client';

import Link from 'next/link';
import { formatBhd, type AssistantCard, type AssistantReply } from '@sahel/domain';
import { t, type AppLocale } from '@sahel/i18n';

/** Avatar for the chosen persona: only the name, color and greeting differ between Suhail and Suhaila. */
export function AssistantAvatar({ persona, locale, size = 32 }: { persona: AssistantReply['persona']; locale: AppLocale; size?: number }) {
  const name = t(locale, persona === 'suhail' ? 'aiPersonaSuhail' : 'aiPersonaSuhaila');
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${persona === 'suhail' ? 'bg-brand' : 'bg-islamic'}`}
      style={{ width: size, height: size, fontSize: size / 2.2 }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function CardView({ card, locale }: { card: AssistantCard; locale: AppLocale }) {
  const money = (fils: number) => formatBhd(fils, locale);
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3 text-sm" data-testid={`assistant-card-${card.kind}`}>
      <p className="mb-1 font-semibold">{card.title}</p>
      {card.kind === 'amounts' && (
        <dl className="space-y-1">
          {card.rows.map((r, i) => (
            <div key={i} className={`flex justify-between gap-3 ${r.emphasis ? 'border-t border-border pt-1 font-bold' : ''}`}>
              <dt>{r.label}</dt>
              <dd className={r.amountFils < 0 ? 'text-islamic' : undefined} data-testid={r.emphasis ? 'assistant-amount-emphasis' : undefined}>
                {r.amountFils < 0 ? `− ${money(-r.amountFils)}` : money(r.amountFils)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {card.kind === 'amounts' && card.note && <p className="mt-2 text-xs text-text-muted">{card.note}</p>}
      {card.kind === 'vehicles' && (
        <ul className="space-y-2">
          {card.items.map((v) => (
            <li key={v.id}>
              <Link href={`/${locale}${v.href}`} className="flex justify-between gap-3 rounded-md px-1 hover:bg-brand-soft" data-testid={`assistant-vehicle-${v.id}`}>
                <span>
                  {v.title} <span className="text-text-muted">{v.year}</span>
                </span>
                <span className="whitespace-nowrap font-semibold text-brand">{t(locale, 'fromPerMonth', { amount: formatBhd(v.fromMonthlyFils, locale, { decimals: 0 }) })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {card.kind === 'list' && (
        <ul className="space-y-1">
          {card.items.map((x, i) => (
            <li key={i}>
              <span className="font-medium">{x.title}</span>
              <span className="block text-xs text-text-muted">{x.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One answer: text in the language it was written in (it may differ from the page's), cards and suggested actions.
 * Actions are plain links to the normal screens; nothing is paid or submitted from the chat.
 */
export function AssistantReplyView({ reply, locale, onAction }: { reply: AssistantReply; locale: AppLocale; onAction?: () => void }) {
  return (
    <div lang={reply.locale} dir={reply.locale === 'ar' ? 'rtl' : 'ltr'} className="min-w-0 flex-1">
      <p className="whitespace-pre-line">{reply.text}</p>
      {reply.cards.map((c, i) => (
        <CardView key={i} card={c} locale={reply.locale} />
      ))}
      {reply.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t(locale, 'aiActionsLabel')}>
          {reply.actions.map((a) => (
            <Link
              key={a.id}
              href={`/${locale}${a.href}`}
              onClick={onAction}
              className={`btn px-3 py-1.5 text-sm ${a.kind === 'payment' ? 'btn-primary' : 'btn-ghost'}`}
              data-testid={`assistant-action-${a.id}`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
