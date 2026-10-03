import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverPaymentPrice } from '@sahel/domain';
import { t } from '@sahel/i18n';
import Link from 'next/link';
import { AcceptOffer } from '@/components/AcceptOffer';
import { applicationTitle, DecisionCard, OfferSummary, Timeline } from '@/components/Application';
import { ContinueFulfilment } from '@/components/HomeFinance';
import { originations } from '@/lib/api';
import { customerApplicationView } from '@/lib/home-finance';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomer } from '@/lib/session';

// Live application state (sandbox store), so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'applicationTitle'), robots: { index: false } };
}

export default async function ApplicationPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const tr = translator(resolveLocale(raw));
  // Only the customer who applied can see it (⚠️ sandbox session).
  const found = originations.get(id, (await pageCustomer()).customerId);
  if (!found) notFound();
  const app = customerApplicationView(found);
  // Conventional home finance waiting for the TRESCO valuation: pay the (server-priced) fee, then continue.
  const valuation = app.nextAction?.type === 'PAY_VALUATION_FEE' ? serverPaymentPrice(app.nextAction.purpose, app.nextAction.reference) : undefined;
  const valuationPaid = app.nextAction?.feePaid === true;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-text-muted">{tr.t('applicationTitle')}</p>
        <h1 className="text-2xl font-bold">{applicationTitle(app, tr)}</h1>
        <p className="font-mono text-xs text-text-muted">{tr.t('applicationReference', { id: app.id })}</p>
      </header>
      {/* Phones: decision, offer, then progress. Desktop: offer in a sticky side column. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:grid-rows-[auto_1fr] lg:items-start">
        <DecisionCard app={app} tr={tr} />
        <div className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <OfferSummary app={app} tr={tr} />
          {app.status === 'APPROVED' && <AcceptOffer locale={tr.locale} applicationId={app.id} />}
          {valuation && (
            <section className="card space-y-3 p-5" data-testid="valuation-step" data-paid={valuationPaid}>
              <p className="text-sm">{tr.t(valuationPaid ? 'homeValuationPaid' : 'homeValuationPending')}</p>
              {valuationPaid ? (
                <ContinueFulfilment locale={tr.locale} applicationId={app.id} />
              ) : (
                <Link
                  className="btn btn-primary w-full"
                  data-testid="pay-valuation"
                  href={`/${tr.locale}/checkout?purpose=${valuation.purpose}&reference=${valuation.reference}&label=${encodeURIComponent(tr.t('requestValuation'))}`}
                >
                  {tr.t('homePayValuation', { amount: tr.money(valuation.amountFils, 0) })}
                </Link>
              )}
            </section>
          )}
          {app.status === 'LEASE_STARTED' && (
            <p className="rounded-[var(--radius-md)] border border-islamic bg-islamic-soft p-4 text-sm text-islamic" data-testid="lease-active">
              {tr.t('homeLeaseActive')}
            </p>
          )}
        </div>
        <Timeline steps={app.steps} tr={tr} />
      </div>
    </div>
  );
}
