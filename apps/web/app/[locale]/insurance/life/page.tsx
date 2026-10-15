import type { Metadata } from 'next';
import Link from 'next/link';
import { bahrainToday, dateOfBirthForAge, LIFE_DEFAULT_AGE } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { LifeQuotes } from '@/components/LifeQuotes';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';

// The default date of birth depends on today's date in Bahrain, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return pageMetadata({ locale, path: '/insurance/life', title: t(locale, 'insLifeTitle'), description: t(locale, 'seoLifeDescription') });
}

export default async function LifeInsurancePage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/${tr.locale}/insurance`} className="text-sm font-semibold text-brand">{tr.t('navInsurance')}</Link>
      <div>
        <h1 className="text-2xl font-bold">{tr.t('insLifeTitle')}</h1>
        <p className="text-text-muted">{tr.t('insLifeBody')}</p>
      </div>
      <LifeQuotes locale={tr.locale} defaultDob={dateOfBirthForAge(LIFE_DEFAULT_AGE, bahrainToday())} />
    </div>
  );
}
