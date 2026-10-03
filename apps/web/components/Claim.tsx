import Link from 'next/link';
import type { ClaimView } from '@sahel/domain';
import type { Translator } from '@/lib/i18n';
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE, CLAIM_TYPE_LABEL } from '@/lib/claims-labels';

/** Date and time in Bahrain, as the timeline shows them. */
export function bahrainDateTime(tr: Translator, iso: string): string {
  return new Intl.DateTimeFormat(tr.locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bahrain',
  }).format(new Date(iso));
}

export function ClaimStatusPill({ claim, tr }: { claim: Pick<ClaimView, 'status'>; tr: Translator }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CLAIM_STATUS_TONE[claim.status]}`} data-testid="claim-status" data-status={claim.status}>
      {tr.t(CLAIM_STATUS_LABEL[claim.status])}
    </span>
  );
}

/** Status timeline: reached steps with their time, then the steps still expected. */
export function ClaimTimeline({ claim, tr }: { claim: ClaimView; tr: Translator }) {
  return (
    <section className="card p-5" aria-labelledby="claim-progress" data-testid="claim-timeline">
      <h2 id="claim-progress" className="mb-3 text-lg font-bold">{tr.t('claimProgress')}</h2>
      <ol className="space-y-3">
        {claim.progress.map((s) => (
          <li key={s.status} className="flex items-start gap-3" data-testid="claim-step" data-status={s.status} data-done={s.done}>
            <span
              aria-hidden
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.done ? (s.status === 'REJECTED' ? 'bg-danger text-white' : 'bg-islamic text-white') : 'border-2 border-border text-text-muted'
              }`}
            >
              {s.done ? (s.status === 'REJECTED' ? '×' : '✓') : ''}
            </span>
            <div>
              <p className={`font-semibold ${s.done ? '' : 'text-text-muted'}`} aria-current={s.current ? 'step' : undefined}>
                {tr.t(CLAIM_STATUS_LABEL[s.status])}
              </p>
              {s.at && <p className="text-xs text-text-muted">{bahrainDateTime(tr, s.at)}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "My claims" on the account page (server-rendered from the same store as GET /api/v1/me/claims). */
export function ClaimList({ claims, tr }: { claims: ClaimView[]; tr: Translator }) {
  if (claims.length === 0) return null;
  return (
    <section aria-labelledby="claims" className="lg:col-span-2" data-testid="my-claims">
      <h2 id="claims" className="mb-3 text-2xl font-bold">{tr.t('claimMyClaims')}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {claims.map((c) => (
          <article key={c.id} className="card flex flex-wrap items-center gap-3 p-4" data-testid="claim-row" data-claim-number={c.claimNumber}>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">
                {tr.t(CLAIM_TYPE_LABEL[c.type])} · {tr.t('claimVehicle', { plate: c.vehicleReference })}
              </h3>
              <p className="font-mono text-xs text-text-muted" dir="ltr">{c.claimNumber}</p>
              <p className="text-xs text-text-muted">{tr.t('claimFiledOn', { date: tr.date(c.createdAt) })}</p>
            </div>
            <ClaimStatusPill claim={c} tr={tr} />
            <Link className="btn btn-ghost px-3 py-1 text-sm" href={`/${tr.locale}/claims/${c.id}`}>
              {tr.t('claimView')}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
