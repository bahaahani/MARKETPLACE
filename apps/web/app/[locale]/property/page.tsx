import type { Metadata } from 'next';
import Link from 'next/link';
import { PROPERTIES, searchProperties, type PropertyPurpose } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { PropertyCard } from '@/components/Listings';
import { resolveLocale, translator } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'navProperty') };
}

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ purpose?: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const sp = await searchParams;
  const purpose = sp.purpose === 'sale' || sp.purpose === 'rent' ? (sp.purpose as PropertyPurpose) : undefined;
  const rows = searchProperties(PROPERTIES, { purpose });
  const tabs: { key?: PropertyPurpose; label: string }[] = [
    { label: tr.t('filterAll') },
    { key: 'sale', label: tr.t('propertyForSale') },
    { key: 'rent', label: tr.t('propertyForRent') },
  ];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{tr.t('navProperty')}</h1>
      <div className="mb-6 flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={`/${tr.locale}/property${tab.key ? `?purpose=${tab.key}` : ''}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${purpose === tab.key ? 'border-brand bg-brand text-white' : 'border-border bg-surface'}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <PropertyCard key={p.id} p={p} tr={tr} />
        ))}
      </div>
    </div>
  );
}
