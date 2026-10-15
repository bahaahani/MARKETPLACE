import type { Metadata } from 'next';
import Link from 'next/link';
import { findProperty } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { HomeQuotes } from '@/components/HomeQuotes';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return pageMetadata({ locale, path: '/insurance/home', title: t(locale, 'insHomeTitle'), description: t(locale, 'seoHomeInsuranceDescription') });
}

/** Home insurance. `?propertyId=` links the quote to a property listing (sums insured suggested from it). */
export default async function HomeInsurancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const tr = translator(resolveLocale((await params).locale));
  const { propertyId } = await searchParams;
  const property = propertyId ? findProperty(propertyId) : undefined;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/${tr.locale}/insurance`} className="text-sm font-semibold text-brand">{tr.t('navInsurance')}</Link>
      <div>
        <h1 className="text-2xl font-bold">{tr.t('insHomeTitle')}</h1>
        <p className="text-text-muted">{tr.t('insHomeBody')}</p>
      </div>
      <HomeQuotes key={property?.id ?? 'none'} locale={tr.locale} propertyId={property?.id} />
    </div>
  );
}
