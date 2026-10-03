import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bhd, findProperty, PROPERTIES } from '@sahel/domain';
import { LOCALES } from '@sahel/i18n';
import { AssetArt } from '@/components/AssetArt';
import { FinanceCalculator } from '@/components/FinanceCalculator';
import { resolveLocale, translator } from '@/lib/i18n';

const VALUATION_FEE_FILS = bhd(150); // ⚠️ placeholder fee

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => PROPERTIES.map((p) => ({ locale, id: p.id })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const p = findProperty(id);
  return p ? { title: p.title[locale === 'ar' ? 'ar' : 'en'] } : {};
}

export default async function PropertyDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const tr = translator(resolveLocale(raw));
  const p = findProperty(id);
  if (!p) notFound();
  const title = p.title[tr.locale];
  const forSale = p.purpose === 'sale';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="card overflow-hidden lg:self-start">
        <AssetArt kind="home" hue={p.accentHue} label={title} />
        <div className="p-5">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-text-muted">
            {p.area[tr.locale]}
            {p.bedrooms > 0 && ` · ${tr.t('bedrooms', { value: p.bedrooms })}`}
            {p.bathrooms > 0 && ` · ${tr.t('bathrooms', { value: p.bathrooms })}`} · {tr.t('sqm', { value: tr.num(p.sizeSqm) })}
          </p>
          <p className="mt-1 text-sm text-text-muted">{tr.t('soldBy', { seller: p.seller.name[tr.locale] })}</p>
          <p className="mt-4 text-3xl font-bold">{forSale ? tr.money(p.priceFils, 0) : tr.t('perMonth', { amount: tr.money(p.priceFils, 0) })}</p>
          {p.valued && <p className="mt-2 inline-block rounded-full bg-islamic-soft px-3 py-1 text-xs font-semibold text-islamic">✓ {tr.t('valuedByTresco')}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn btn-primary" type="button" disabled>
              {tr.t('bookViewing')}
            </button>
            {forSale && (
              <Link
                className="btn btn-ghost"
                href={`/${tr.locale}/checkout?purpose=valuation_fee&amount=${VALUATION_FEE_FILS}&reference=${p.id}&label=${encodeURIComponent(tr.t('requestValuation'))}`}
              >
                {tr.t('requestValuation')} · {tr.money(VALUATION_FEE_FILS, 0)}
              </Link>
            )}
          </div>
        </div>
      </div>
      {forSale && (
        <div className="lg:sticky lg:top-20 lg:self-start">
          <FinanceCalculator locale={tr.locale} productLine="home" assetPriceFils={p.priceFils} />
        </div>
      )}
    </div>
  );
}
