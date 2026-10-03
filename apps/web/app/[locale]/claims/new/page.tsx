import type { Metadata } from 'next';
import Link from 'next/link';
import { claimRules } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { ClaimForm, type ClaimablePolicy } from '@/components/ClaimForm';
import { resolveLocale, translator } from '@/lib/i18n';
import { policyStore } from '@/lib/policy-store';
import { pageCustomer } from '@/lib/session';

// The customer's own policies, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'claimNewTitle'), robots: { index: false } };
}

/**
 * "I had an accident" (J6): First Notice of Loss for one of the customer's active motor policies.
 * Opened from My policies (?policyId=) or from My Garage (?plate=).
 */
export default async function NewClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ policyId?: string; plate?: string }>;
}) {
  const tr = translator(resolveLocale((await params).locale));
  const { policyId, plate } = await searchParams;
  const customer = await pageCustomer();
  const policies: ClaimablePolicy[] = policyStore
    .list(customer.customerId)
    .flatMap((p) =>
      p.status === 'ACTIVE' && p.cover.line === 'motor'
        ? [{ id: p.id, policyNumber: p.policyNumber, insurerName: p.insurerName, plate: p.cover.reference }]
        : [],
    );
  const initial = policies.find((p) => p.id === policyId) ?? policies.find((p) => p.plate === plate);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('claimNewTitle')}</h1>
        <p className="text-text-muted">{tr.t('claimNewSubtitle')}</p>
      </header>
      {policies.length === 0 ? (
        <section className="card space-y-3 p-5" data-testid="claim-no-policy">
          <p>{tr.t('claimNoMotorPolicy')}</p>
          <Link className="btn btn-primary" href={`/${tr.locale}/insurance#motor`}>
            {tr.t('claimGetMotorCover')}
          </Link>
        </section>
      ) : (
        <ClaimForm locale={tr.locale} policies={policies} initialPolicyId={initial?.id} rules={claimRules()} />
      )}
      <p className="text-xs text-text-muted">⚠️ {tr.t('claimSandboxNote')}</p>
    </div>
  );
}
