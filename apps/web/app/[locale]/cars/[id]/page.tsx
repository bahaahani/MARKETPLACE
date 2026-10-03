import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bhd, findVehicle, VEHICLES } from '@sahel/domain';
import { LOCALES } from '@sahel/i18n';
import { CarApplyButton, FinanceSelectionProvider } from '@/components/ApplyFinance';
import { AssetArt } from '@/components/AssetArt';
import { FinanceCalculator } from '@/components/FinanceCalculator';
import { InsuranceQuotes } from '@/components/InsuranceQuotes';
import { resolveLocale, translator } from '@/lib/i18n';

const DEPOSIT_FILS = bhd(100);

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => VEHICLES.map((v) => ({ locale, id: v.id })));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const v = findVehicle((await params).id);
  return v ? { title: `${v.make} ${v.model} ${v.year}` } : {};
}

export default async function CarDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const tr = translator(resolveLocale(raw));
  const v = findVehicle(id);
  if (!v) notFound();
  const title = `${v.make} ${v.model}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: `${title} ${v.trim}`,
    brand: v.make,
    modelDate: String(v.year),
    itemCondition: v.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: v.mileageKm, unitCode: 'KMT' },
    offers: { '@type': 'Offer', price: (v.priceFils / 1000).toFixed(3), priceCurrency: 'BHD', seller: { '@type': 'Organization', name: v.seller.name.en } },
  };

  return (
    <FinanceSelectionProvider>
      <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <AssetArt kind="car" hue={v.accentHue} label={title} />
            <div className="p-5">
              <h1 className="text-2xl font-bold">
                {title} <span className="font-normal text-text-muted">{v.trim}</span>
              </h1>
              <p className="mt-1 text-text-muted">
                {v.year} · {tr.t(v.condition === 'new' ? 'conditionNew' : 'conditionUsed')}
                {v.condition === 'used' && ` · ${tr.t('km', { value: tr.num(v.mileageKm) })}`} · {tr.t('seats', { value: v.seats })} · {v.color[tr.locale]}
              </p>
              <p className="mt-1 text-sm text-text-muted">{tr.t('soldBy', { seller: v.seller.name[tr.locale] })}</p>
              <p className="mt-4 text-3xl font-bold">{tr.money(v.priceFils, 0)}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  className="btn btn-primary"
                  data-testid="reserve"
                  href={`/${tr.locale}/checkout?purpose=reservation_deposit&amount=${DEPOSIT_FILS}&reference=${v.id}&label=${encodeURIComponent(`${title} ${v.year}`)}`}
                >
                  {tr.t('reserveCar', { amount: tr.money(DEPOSIT_FILS, 0) })}
                </Link>
                <CarApplyButton locale={tr.locale} vehicleId={v.id} />
              </div>
              <p className="mt-2 text-xs text-text-muted">{tr.t('applyConsent')}</p>
            </div>
          </div>
          <InsuranceQuotes locale={tr.locale} vehicleValueFils={v.priceFils} reference={v.id} />
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <FinanceCalculator locale={tr.locale} productLine="vehicle" assetPriceFils={v.priceFils} />
        </div>
      </div>
    </FinanceSelectionProvider>
  );
}
