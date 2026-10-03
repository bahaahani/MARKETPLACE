import type { Metadata } from 'next';
import Link from 'next/link';
import { applicationView, claimView } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { ApplicationRow } from '@/components/Application';
import { ClaimList } from '@/components/Claim';
import { AutopayToggle } from '@/components/BundlesAutopayToggle';
import { ContractSettlement } from '@/components/BundlesSettlement';
import { MyCards } from '@/components/MyCards';
import { PolicyList } from '@/components/PolicyList';
import { SharePreApproval } from '@/components/SharePreApproval';
import { cardIssuer, originations } from '@/lib/api';
import { STRUCTURE_LABEL } from '@/lib/labels';
import { resolveLocale, translator } from '@/lib/i18n';
import { policyStore } from '@/lib/policy-store';
import { claimStore } from '@/lib/claims-store';
import { pageCustomerView } from '@/lib/session';

// Personalized (customer data and due dates), so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'navAccount') };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  // Everything here belongs to the session's customer (⚠️ sandbox session until eKey login).
  const me = await pageCustomerView();
  const applications = originations.list(me.customerId).map(applicationView);
  const cards = cardIssuer.list(me.customerId);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {applications.length > 0 && (
        <section aria-labelledby="apps" className="lg:col-span-2">
          <h2 id="apps" className="mb-3 text-2xl font-bold">{tr.t('myApplications')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {applications.map((a) => (
              <ApplicationRow key={a.id} app={a} tr={tr} />
            ))}
          </div>
        </section>
      )}
      <MyCards cards={cards} tr={tr} />
      <PolicyList policies={policyStore.list(me.customerId)} tr={tr} />
      <ClaimList claims={claimStore.list(me.customerId).map(claimView)} tr={tr} />
      <section aria-labelledby="inst">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 id="inst" className="text-2xl font-bold">{tr.t('myInstallments')}</h1>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-[#8a5c00]">★ {tr.t('rewardsPoints', { value: tr.num(me.rewardsPoints) })}</span>
        </div>
        <div className="space-y-3">
          {me.contracts.map((c) => (
            <article key={c.id} className="card p-4" data-testid="contract">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{c.title[tr.locale]}</h2>
                  <p className={`text-xs font-semibold ${c.structure === 'conventional' ? 'text-brand' : 'text-islamic'}`}>{tr.t(STRUCTURE_LABEL[c.structure])}</p>
                </div>
                {c.settlement ? (
                  <span className="rounded-full bg-islamic-soft px-2 py-0.5 text-xs font-semibold text-islamic" data-testid={`contract-settled-${c.id}`}>
                    ✓ {tr.t('contractSettled', { date: tr.date(c.settlement.settledOn) })}
                  </span>
                ) : (
                  <AutopayToggle key={String(c.autopay)} locale={tr.locale} contractId={c.id} autopay={c.autopay} />
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-text-muted">{tr.t('outstanding')}</p>
                  <p className="font-bold">{tr.money(c.outstandingFils)}</p>
                </div>
                {c.nextInstallment && (
                  <div>
                    <p className="text-text-muted">{tr.t('nextDue', { date: tr.date(c.nextInstallment.dueDate) })}</p>
                    <p className="font-bold">{tr.money(c.nextInstallment.amountFils)}</p>
                  </div>
                )}
              </div>
              {c.nextInstallment && (
                <Link
                  className="btn btn-primary mt-3 w-full"
                  href={`/${tr.locale}/checkout?purpose=installment&amount=${c.nextInstallment.amountFils}&reference=${c.id}-${c.nextInstallment.number}&label=${encodeURIComponent(c.title[tr.locale])}`}
                >
                  {tr.t('payNow')}
                </Link>
              )}
              {!c.settlement && <ContractSettlement c={c} tr={tr} />}
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="garage">
        <h2 id="garage" className="mb-3 text-2xl font-bold">{tr.t('myGarage')}</h2>
        {me.garage.map((g) => (
          <article key={g.plate} className="card p-4">
            <h3 className="font-semibold">{g.title}</h3>
            <p className="text-sm text-text-muted">#{g.plate} · {tr.t('km', { value: tr.num(g.odometerKm) })}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between rounded-lg bg-background p-3">
                {tr.t('registrationExpiry', { date: tr.date(g.registrationExpiry) })}
                <button className="btn btn-ghost px-3 py-1 text-xs" type="button" disabled>{tr.t('renew')}</button>
              </li>
              <li className="flex items-center justify-between rounded-lg bg-background p-3">
                {tr.t('insuranceExpiry', { date: tr.date(g.insuranceExpiry) })}
                <Link className="btn btn-ghost px-3 py-1 text-xs" href={`/${tr.locale}/insurance`}>{tr.t('renew')}</Link>
              </li>
            </ul>
            <Link className="btn btn-ghost mt-3 w-full text-danger" href={`/${tr.locale}/claims/new?plate=${encodeURIComponent(g.plate)}`} data-testid="garage-accident">
              {tr.t('claimAccidentButton')}
            </Link>
          </article>
        ))}
        <div className="mt-6">
          <SharePreApproval locale={tr.locale} />
        </div>
        <p className="mt-4 text-xs text-text-muted" data-testid="session-note">⚠️ {tr.t('sessionSandboxNote')}</p>
      </section>
    </div>
  );
}
