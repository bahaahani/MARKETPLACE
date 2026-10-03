import type { Metadata } from 'next';
import { backOfficeKpis, type ApplicationStatus } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { BackOfficeSignIn } from '@/components/BackOffice';
import { originations, payments } from '@/lib/api';
import { isPolicyBound, pageStaffSession } from '@/lib/backoffice-api';
import { resolveLocale, translator } from '@/lib/i18n';
import { STATUS_LABEL } from '@/lib/labels';

// Live sandbox stores, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'boTitle'), robots: { index: false } };
}

/** Back-office entry: the role picker (⚠️ sandbox sign-in), then the KPI dashboard. */
export default async function BackOfficeHome({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const staff = await pageStaffSession();

  if (!staff) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">{tr.t('boChooseRoleTitle')}</h1>
        <p className="mb-6 mt-1 text-sm text-text-muted">{tr.t('boChooseRoleSubtitle')}</p>
        <BackOfficeSignIn locale={tr.locale} />
      </div>
    );
  }

  const k = backOfficeKpis(staff, originations.listAll(), payments.listAll(), isPolicyBound);
  const minutes = (v: number | null) => (v === null ? tr.t('boKpiNone') : tr.t('boMinutes', { value: tr.num(v) }));
  const kpis = [
    { key: 'apps-today', label: tr.t('boKpiAppsToday'), value: tr.num(k.applicationsTodayTotal) },
    { key: 'approval-rate', label: tr.t('boKpiApprovalRate'), value: k.approvalRatePct === null ? tr.t('boKpiNone') : `${tr.num(k.approvalRatePct)}%` },
    { key: 'avg-decision', label: tr.t('boKpiAvgDecision'), value: minutes(k.avgDecisionMinutes) },
    { key: 'avg-review', label: tr.t('boKpiAvgReview'), value: minutes(k.avgReviewMinutes) },
    { key: 'referred', label: tr.t('boKpiReferredPending'), value: tr.num(k.referredPending) },
    { key: 'refunds', label: tr.t('boKpiRefundsPending'), value: `${tr.num(k.refundsPending)} · ${tr.money(k.refundsPendingFils)}` },
  ];
  const byStatus = Object.entries(k.applicationsToday) as [ApplicationStatus, number][];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tr.t('boNavDashboard')}</h1>
      <p className="text-xs text-text-muted">{tr.t('boKpiDate', { date: tr.date(`${k.date}T12:00:00Z`) })}</p>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label={tr.t('boNavDashboard')}>
        {kpis.map((x) => (
          <div key={x.key} className="card p-4" data-testid={`bo-kpi-${x.key}`}>
            <p className="text-xs text-text-muted">{x.label}</p>
            <p className="mt-1 text-xl font-bold">{x.value}</p>
          </div>
        ))}
      </section>
      <section className="card p-4" aria-labelledby="by-status">
        <h2 id="by-status" className="mb-2 font-semibold">{tr.t('boKpiByStatus')}</h2>
        {byStatus.length === 0 ? (
          <p className="text-sm text-text-muted">{tr.t('boKpiNone')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="bo-by-status">
            {byStatus.map(([status, n]) => (
              <li key={status} className="rounded-full bg-brand-soft px-3 py-1 text-sm text-brand" data-status={status}>
                {tr.t(STATUS_LABEL[status])}: <span className="font-semibold">{tr.num(n)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
