import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { claimView } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { bahrainDateTime, ClaimStatusPill, ClaimTimeline } from '@/components/Claim';
import { GaragePicker, SandboxAdvance } from '@/components/ClaimActions';
import { CLAIM_SEVERITY_LABEL, CLAIM_TYPE_LABEL } from '@/lib/claims-labels';
import { claimStore } from '@/lib/claims-store';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomer } from '@/lib/session';

// Live claim state (sandbox store), so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'claimProgress'), robots: { index: false } };
}

export default async function ClaimPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const tr = translator(resolveLocale(raw));
  // Only the customer who filed it can see it (⚠️ sandbox session).
  const found = claimStore.get(id, (await pageCustomer()).customerId);
  if (!found) notFound();
  const claim = claimView(found);
  const e = claim.estimate;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-muted">
            {tr.t(CLAIM_TYPE_LABEL[claim.type])} · {tr.t('claimVehicle', { plate: claim.vehicleReference })}
          </p>
          <h1 className="text-2xl font-bold" data-testid="claim-number" data-claim-number={claim.claimNumber}>
            {tr.t('claimTitle', { number: claim.claimNumber })}
          </h1>
          <p className="font-mono text-xs text-text-muted" dir="ltr">{tr.t('insPolicyNumber', { number: claim.policyNumber })}</p>
        </div>
        <ClaimStatusPill claim={claim} tr={tr} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="space-y-6">
          <section className="card p-5" aria-labelledby="estimate" data-testid="claim-estimate" data-estimate={e.estimateFils}>
            <h2 id="estimate" className="text-lg font-bold">{tr.t('claimEstimateTitle')}</h2>
            <p className="mt-1 text-2xl font-bold">{e.totalLoss ? tr.money(e.estimateFils) : tr.t('claimEstimateRange', { low: tr.money(e.lowFils), high: tr.money(e.highFils) })}</p>
            {e.totalLoss && <p className="text-sm">{tr.t('claimEstimateTotalLoss')}</p>}
            {claim.approvedAmountFils !== undefined && (
              <p className="mt-2 text-sm" data-testid="claim-approved-amount">
                {tr.t('claimApprovedAmount')}: <strong>{tr.money(claim.approvedAmountFils)}</strong>
              </p>
            )}
            <p className="mt-2 rounded-lg bg-accent/10 p-2 text-xs text-[#8a5c00]" data-testid="estimate-not-ai">⚠️ {tr.t('claimEstimateNotAi')}</p>
          </section>

          {(claim.canBookGarage || claim.garage || (claim.status !== 'REJECTED' && !e.totalLoss && claim.status !== 'SETTLED')) && (
            <section className="card p-5" aria-labelledby="garage" data-testid="claim-garage">
              <h2 id="garage" className="mb-2 text-lg font-bold">{tr.t('claimGarageTitle')}</h2>
              {claim.garage ? (
                <p className="font-semibold text-islamic" data-testid="garage-booked">
                  ✓ {tr.t('claimGarageBooked', { garage: claim.garage.name[tr.locale] })}
                </p>
              ) : claim.canBookGarage ? (
                <GaragePicker locale={tr.locale} claimId={claim.id} garages={claim.garageOptions} agencyRepair={claim.agencyRepair} />
              ) : (
                <p className="text-sm text-text-muted">{tr.t('claimGarageAfterApproval')}</p>
              )}
            </section>
          )}

          <section className="card p-5" aria-labelledby="details" data-testid="claim-details">
            <h2 id="details" className="mb-2 text-lg font-bold">{tr.t('claimDetails')}</h2>
            <dl className="space-y-1 text-sm">
              {(
                [
                  [tr.t('claimIncident'), bahrainDateTime(tr, claim.incidentAt)],
                  [tr.t('claimLocation'), claim.location],
                  [tr.t('claimSeverity'), tr.t(CLAIM_SEVERITY_LABEL[claim.severity])],
                  [tr.t('claimPhotos'), tr.t('claimPhotosReceived', { count: claim.photos.length })],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-text-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-sm">{claim.thirdPartyInvolved ? tr.t('claimThirdPartyYes') : tr.t('claimThirdPartyNo')}</p>
            {claim.policeReportNumber && <p className="text-sm" dir="auto">{tr.t('claimPoliceReportNumber', { number: claim.policeReportNumber })}</p>}
            <p className="mt-2 whitespace-pre-line text-sm text-text-muted" dir="auto">{claim.description}</p>
          </section>
        </div>

        <div className="space-y-4">
          <ClaimTimeline claim={claim} tr={tr} />
          {claim.replacementCar.offered && (
            <section className="card border-islamic p-5" aria-labelledby="replacement" data-testid="replacement-car">
              <h2 id="replacement" className="text-lg font-bold">🚗 {tr.t('claimReplacementTitle')}</h2>
              <p className="mt-1 text-sm">
                {tr.t('claimReplacementBody', {
                  provider: claim.replacementCar.provider[tr.locale],
                  vehicleClass: claim.replacementCar.vehicleClass[tr.locale],
                  days: claim.replacementCar.days,
                })}
              </p>
              <p className="mt-1 text-xs text-text-muted">{tr.t('claimReplacementNote')}</p>
            </section>
          )}
          <SandboxAdvance locale={tr.locale} claimId={claim.id} nextStatuses={claim.nextStatuses} />
          <p className="text-xs text-text-muted">⚠️ {tr.t('claimSandboxNote')}</p>
        </div>
      </div>
    </div>
  );
}
