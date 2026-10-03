import Link from 'next/link';
import type { PropertyListing, VehicleListing } from '@sahel/domain';
import type { Translator } from '@/lib/i18n';
import { AssetArt } from './AssetArt';

export function VehicleCard({ v, tr }: { v: VehicleListing; tr: Translator }) {
  const title = `${v.make} ${v.model}`;
  return (
    <Link href={`/${tr.locale}/cars/${v.id}`} className="card group overflow-hidden transition hover:shadow-lg" data-testid="vehicle-card">
      <AssetArt kind="car" hue={v.accentHue} label={title} />
      <div className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${v.condition === 'new' ? 'bg-brand-soft text-brand' : 'bg-background text-text-muted'}`}>
            {tr.t(v.condition === 'new' ? 'conditionNew' : 'conditionUsed')}
          </span>
          {v.inspected && <span className="rounded-full bg-islamic-soft px-2 py-0.5 font-semibold text-islamic">✓ {tr.t('inspected')}</span>}
        </div>
        <h3 className="font-semibold group-hover:text-brand">
          {title} <span className="font-normal text-text-muted">{v.trim} · {v.year}</span>
        </h3>
        <p className="text-sm text-text-muted">
          {v.condition === 'used' ? `${tr.t('km', { value: tr.num(v.mileageKm) })} · ` : ''}
          {tr.money(v.priceFils, 0)}
        </p>
        <p className="text-lg font-bold text-brand">{tr.t('fromPerMonth', { amount: tr.money(v.fromMonthlyFils, 0) })}</p>
      </div>
    </Link>
  );
}

export function PropertyCard({ p, tr }: { p: PropertyListing; tr: Translator }) {
  const title = p.title[tr.locale];
  return (
    <Link href={`/${tr.locale}/property/${p.id}`} className="card group overflow-hidden transition hover:shadow-lg" data-testid="property-card">
      <AssetArt kind="home" hue={p.accentHue} label={title} />
      <div className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand">
            {tr.t(p.purpose === 'sale' ? 'propertyForSale' : 'propertyForRent')}
          </span>
          {p.valued && <span className="rounded-full bg-islamic-soft px-2 py-0.5 font-semibold text-islamic">✓ {tr.t('valuedByTresco')}</span>}
        </div>
        <h3 className="font-semibold group-hover:text-brand">{title}</h3>
        <p className="text-sm text-text-muted">
          {p.area[tr.locale]}
          {p.bedrooms > 0 && ` · ${tr.t('bedrooms', { value: p.bedrooms })}`} · {tr.t('sqm', { value: tr.num(p.sizeSqm) })}
        </p>
        <p className="text-sm text-text-muted">{tr.money(p.priceFils, 0)}</p>
        <p className="text-lg font-bold text-brand">
          {p.purpose === 'rent' ? tr.t('perMonth', { amount: tr.money(p.priceFils, 0) }) : tr.t('fromPerMonth', { amount: tr.money(p.fromMonthlyFils, 0) })}
        </p>
      </div>
    </Link>
  );
}
