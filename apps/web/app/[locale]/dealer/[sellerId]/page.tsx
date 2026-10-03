import type { Metadata } from 'next';
import { dealerInventory, findDealer, leadStats, LISTING_DEFAULTS } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { notFound } from 'next/navigation';
import { DealerLeadsBoard } from '@/components/DealerLeadsBoard';
import { leads } from '@/lib/api';
import { resolveLocale, translator } from '@/lib/i18n';

// Leads change at runtime, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'dealerNavDashboard') };
}

export default async function DealerDashboard({ params }: { params: Promise<{ locale: string; sellerId: string }> }) {
  const { locale, sellerId } = await params;
  const tr = translator(resolveLocale(locale));
  if (!findDealer(sellerId)) notFound();
  const inv = dealerInventory(sellerId);
  const myLeads = leads.list(sellerId);
  const ls = leadStats(myLeads);
  const d = LISTING_DEFAULTS.vehicle;

  const kpis = [
    { key: 'stock', label: tr.t('dealerKpiStock'), value: tr.num(inv.stats.count) },
    { key: 'avg', label: tr.t('dealerKpiAvgPrice'), value: tr.money(inv.stats.avgPriceFils, 0) },
    { key: 'mix', label: tr.t('dealerKpiNewUsed'), value: tr.t('dealerKpiNewUsedValue', { newCount: tr.num(inv.stats.newCount), usedCount: tr.num(inv.stats.usedCount) }) },
    { key: 'open', label: tr.t('dealerKpiOpenLeads'), value: tr.num(ls.open) },
    { key: 'won', label: tr.t('dealerKpiWon'), value: tr.num(ls.won) },
  ];

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label={tr.t('dealerNavDashboard')}>
        {kpis.map((k) => (
          <div key={k.key} className="card p-4" data-testid={`kpi-${k.key}`}>
            <p className="text-xs text-text-muted">{k.label}</p>
            <p className="mt-1 text-xl font-bold">{k.value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="inv-title">
        <h2 id="inv-title" className="text-xl font-bold">{tr.t('dealerInventoryTitle')}</h2>
        <p className="mb-3 text-xs text-text-muted">{tr.t('dealerInventoryNote', { down: tr.num(d.downPaymentPct), months: tr.num(d.tenureMonths) })}</p>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-testid="inventory-table">
            <thead className="bg-background text-xs text-text-muted">
              <tr>
                <th className="p-3 text-start font-semibold">{tr.t('dealerColVehicle')}</th>
                <th className="p-3 text-start font-semibold">{tr.t('dealerColCondition')}</th>
                <th className="p-3 text-end font-semibold">{tr.t('price')}</th>
                <th className="p-3 text-end font-semibold">{tr.t('dealerColMonthlyConventional')}</th>
                <th className="p-3 text-end font-semibold">{tr.t('dealerColMonthlyIslamic')}</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((v) => (
                <tr key={v.id} className="border-t border-border" data-testid="inventory-row">
                  <td className="p-3">
                    <p className="font-semibold">{v.make} {v.model} {v.year}</p>
                    <p className="text-xs text-text-muted">{v.trim} · {tr.t('km', { value: tr.num(v.mileageKm) })}</p>
                  </td>
                  <td className="p-3">{tr.t(v.condition === 'new' ? 'conditionNew' : 'conditionUsed')}</td>
                  <td className="whitespace-nowrap p-3 text-end">{tr.money(v.priceFils, 0)}</td>
                  <td className="whitespace-nowrap p-3 text-end font-semibold text-brand">{tr.money(v.fromMonthlyFils)}</td>
                  <td className="whitespace-nowrap p-3 text-end font-semibold text-islamic">{tr.money(v.fromMonthlyMurabahaFils)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="leads-title">
        <h2 id="leads-title" className="mb-3 text-xl font-bold">{tr.t('dealerLeadsTitle')}</h2>
        <DealerLeadsBoard locale={tr.locale} sellerId={sellerId} initial={myLeads} />
      </section>
    </div>
  );
}
