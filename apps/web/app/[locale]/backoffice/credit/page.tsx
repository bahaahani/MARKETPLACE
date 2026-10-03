import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, creditQueue, findVehicle } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { CreditDecisionForm } from '@/components/BackOffice';
import { originations } from '@/lib/api';
import { pageStaffSession, profileOf } from '@/lib/backoffice-api';
import { REASON_LABEL } from '@/lib/backoffice-labels';
import { resolveLocale, translator } from '@/lib/i18n';
import { STRUCTURE_LABEL } from '@/lib/labels';

// Live sandbox store, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'boNavCredit'), robots: { index: false } };
}

/** Credit review queue: every customer's REFERRED applications. Credit officers decide; compliance reads. */
export default async function CreditQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const staff = await pageStaffSession();
  if (!staff) redirect(`/${tr.locale}/backoffice`);
  if (!can(staff.role, 'applications.read')) return <p className="text-danger" data-testid="bo-forbidden">{tr.t('boForbidden')}</p>;

  const items = creditQueue(staff, originations.listAll(), profileOf);
  const decides = can(staff.role, 'applications.decide');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('boCreditTitle')}</h1>
        <p className="mt-1 text-sm text-text-muted">{tr.t('boCreditSubtitle')}</p>
        {!decides && <p className="mt-1 text-sm font-semibold text-text-muted" data-testid="bo-read-only">{tr.t('boReadOnly')}</p>}
      </header>
      {items.length === 0 ? (
        <p className="card p-4 text-sm text-text-muted" data-testid="bo-credit-empty">{tr.t('boCreditEmpty')}</p>
      ) : (
        <ul className="space-y-3" data-testid="bo-credit-queue">
          {items.map((a) => {
            const v = a.productLine === 'vehicle' ? findVehicle(a.reference) : undefined;
            return (
              <li key={a.id} className="card grid gap-4 p-4 lg:grid-cols-[1fr_320px]" data-testid="bo-referred" data-id={a.id}>
                <div className="space-y-3">
                  <div>
                    <p className="text-lg font-semibold" data-testid="bo-applicant">
                      {a.firstName[tr.locale]}
                      {a.cprMasked && <span className="ms-2 font-mono text-xs text-text-muted">{tr.t('boCprMasked', { cpr: a.cprMasked })}</span>}
                    </p>
                    <p className="font-mono text-xs text-text-muted">{a.id}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-text-muted">{tr.t('boColProduct')}</dt>
                      <dd className="font-semibold">
                        {tr.t(a.productLine === 'vehicle' ? 'boProductVehicle' : 'boProductPersonal')}
                        {v && <span className="block text-xs font-normal text-text-muted">{v.make} {v.model} {v.year}</span>}
                      </dd>
                      <dd className={`text-xs font-semibold ${a.structure === 'conventional' ? 'text-brand' : 'text-islamic'}`} data-testid="bo-structure">
                        {tr.t(STRUCTURE_LABEL[a.structure])}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">{tr.t('boColAmount')}</dt>
                      <dd className="font-semibold" data-testid="bo-amount">{tr.money(a.financedFils, 0)}</dd>
                      <dd className="text-xs text-text-muted">{tr.t('months', { value: a.tenureMonths })}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">{tr.t('boColMonthly')}</dt>
                      <dd className="font-semibold" data-testid="bo-monthly">{tr.money(a.monthlyFils)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">{tr.t('boColDbr')}</dt>
                      <dd className="font-semibold" data-testid="bo-dbr">
                        {a.dbrAfterPct === null ? '–' : tr.t('boDbrValue', { value: tr.num(a.dbrAfterPct), cap: tr.num(a.dbrCapPct) })}
                      </dd>
                    </div>
                    {a.financials && (
                      <div>
                        <dt className="text-xs text-text-muted">{tr.t('boColSalary')}</dt>
                        <dd className="font-semibold" data-testid="bo-financials">
                          {tr.money(a.financials.monthlySalaryFils, 0)} / {tr.money(a.financials.existingObligationsFils, 0)}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div>
                    <p className="text-xs text-text-muted">{tr.t('boColReasons')}</p>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {a.reasons.map((r) => (
                        <li key={r} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-[#8a5c00]" data-reason={r}>
                          {tr.t(REASON_LABEL[r])}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {decides && <CreditDecisionForm locale={tr.locale} applicationId={a.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
