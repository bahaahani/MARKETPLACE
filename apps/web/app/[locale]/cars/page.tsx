import type { Metadata } from 'next';
import { searchVehicles, VEHICLES, type BodyType, type VehicleCondition } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { VehicleCard } from '@/components/Listings';
import { resolveLocale, translator } from '@/lib/i18n';

type SP = Promise<{ q?: string; condition?: string; bodyType?: string; maxMonthlyFils?: string }>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return { title: t(locale, 'navCars') };
}

const MONTHLY_OPTIONS = [100, 150, 200, 300, 500];

export default async function CarsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const tr = translator(resolveLocale((await params).locale));
  const sp = await searchParams;
  const condition = sp.condition === 'new' || sp.condition === 'used' ? (sp.condition as VehicleCondition) : undefined;
  const maxMonthlyFils = sp.maxMonthlyFils ? Number(sp.maxMonthlyFils) || undefined : undefined;
  const rows = searchVehicles(VEHICLES, { q: sp.q, condition, bodyType: (sp.bodyType as BodyType) || undefined, maxMonthlyFils });

  // Plain GET form: works without JavaScript and keeps result pages crawlable.
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{tr.t('navCars')}</h1>
      <form className="card mb-6 flex flex-wrap items-end gap-3 p-4" role="search">
        <label className="min-w-48 flex-1">
          <span className="sr-only">{tr.t('searchCars')}</span>
          <input name="q" defaultValue={sp.q} placeholder={tr.t('searchCars')} className="w-full rounded-md border border-border px-3 py-2" />
        </label>
        <select name="condition" defaultValue={condition ?? ''} className="rounded-md border border-border px-3 py-2" aria-label={tr.t('conditionNew')}>
          <option value="">{tr.t('filterAll')}</option>
          <option value="new">{tr.t('filterNew')}</option>
          <option value="used">{tr.t('filterUsed')}</option>
        </select>
        <select name="maxMonthlyFils" defaultValue={maxMonthlyFils ? String(maxMonthlyFils) : ''} className="rounded-md border border-border px-3 py-2" aria-label={tr.t('filterMaxMonthly')}>
          <option value="">{tr.t('filterMaxMonthly')}</option>
          {MONTHLY_OPTIONS.map((b) => (
            <option key={b} value={b * 1000}>
              ≤ {tr.money(b * 1000, 0)}
            </option>
          ))}
          {maxMonthlyFils && !MONTHLY_OPTIONS.includes(maxMonthlyFils / 1000) && <option value={maxMonthlyFils}>≤ {tr.money(maxMonthlyFils, 0)}</option>}
        </select>
        <button className="btn btn-primary" type="submit">
          {tr.t('searchCars').split(' ')[0]}
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="text-text-muted">{tr.t('noResults')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((v) => (
            <VehicleCard key={v.id} v={v} tr={tr} />
          ))}
        </div>
      )}
    </div>
  );
}
