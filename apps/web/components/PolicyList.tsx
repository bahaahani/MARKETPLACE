import Link from 'next/link';
import type { Policy } from '@sahel/domain';
import { HOME_TYPE_LABEL, LINE_LABEL, POLICY_STATUS_LABEL, REGION_LABEL, TIER_LABEL } from '@/lib/insurance-labels';
import type { Translator } from '@/lib/i18n';

/** One line describing what a policy covers. */
function coverSummary(p: Policy, tr: Translator): string {
  const c = p.cover;
  switch (c.line) {
    case 'motor':
      return [`#${c.reference}`, tr.t(c.cover === 'comprehensive' ? 'comprehensive' : 'thirdParty')].join(' · ');
    case 'travel':
      return [tr.t(REGION_LABEL[c.region]), tr.t(TIER_LABEL[c.tier]), tr.t('insTravellersCount', { count: c.adults + c.children })].join(' · ');
    case 'home':
      return [
        c.propertyTitle ? c.propertyTitle[tr.locale] : HOME_TYPE_LABEL[c.propertyType] && tr.t(HOME_TYPE_LABEL[c.propertyType]!),
        c.buildingSumInsuredFils > 0 && tr.t('insBuildingCover', { amount: tr.money(c.buildingSumInsuredFils, 0) }),
        c.contentsSumInsuredFils > 0 && tr.t('insContentsCover', { amount: tr.money(c.contentsSumInsuredFils, 0) }),
      ]
        .filter(Boolean)
        .join(' · ');
  }
}

/** "My policies" on the account page (server-rendered from the same store as GET /api/v1/me/policies). */
export function PolicyList({ policies, tr }: { policies: Policy[]; tr: Translator }) {
  return (
    <section aria-labelledby="policies" className="lg:col-span-2" data-testid="my-policies">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="policies" className="text-2xl font-bold">{tr.t('insMyPolicies')}</h2>
        <Link href={`/${tr.locale}/insurance`} className="text-sm font-semibold text-brand">{tr.t('navInsurance')}</Link>
      </div>
      {policies.length === 0 && <p className="text-text-muted">{tr.t('insNoPolicies')}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {policies.map((p) => (
          <article key={p.id} className="card p-4" data-testid="policy" data-policy-number={p.policyNumber} data-status={p.status}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold">
                  {tr.t(LINE_LABEL[p.line])} · {p.insurerName[tr.locale]}
                  {p.takaful && <span className="ms-2 rounded-full bg-islamic-soft px-2 py-0.5 text-xs text-islamic">{tr.t('takaful')}</span>}
                </h3>
                <p className="font-mono text-xs text-text-muted" dir="ltr">{tr.t('insPolicyNumber', { number: p.policyNumber })}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === 'ACTIVE' ? 'bg-islamic-soft text-islamic' : 'bg-background text-text-muted'}`}>
                {tr.t(POLICY_STATUS_LABEL[p.status])}
              </span>
            </div>
            <p className="mt-2 text-sm">{coverSummary(p, tr)}</p>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-text-muted">
              <span>{tr.t('insPolicyPeriod', { start: tr.date(p.startDate), end: tr.date(p.endDate) })}</span>
              <span className="font-semibold text-text">{tr.t('insPremiumPaid', { amount: tr.money(p.premiumFils) })}</span>
            </div>
            {p.line === 'motor' && p.status === 'ACTIVE' && (
              <Link className="btn btn-ghost mt-3 w-full text-danger" href={`/${tr.locale}/claims/new?policyId=${encodeURIComponent(p.id)}`} data-testid="policy-accident">
                {tr.t('claimAccidentButton')}
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
