import type { Metadata } from 'next';
import Link from 'next/link';
import { bahrainToday, dateOfBirthForAge, MEDICAL_DEFAULT_PRIMARY_AGE } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { MedicalQuotes } from '@/components/MedicalQuotes';
import { resolveLocale, translator } from '@/lib/i18n';

// Default dates of birth depend on today's date in Bahrain, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'insMedTitle') };
}

export default async function MedicalInsurancePage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const today = bahrainToday();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/${tr.locale}/insurance`} className="text-sm font-semibold text-brand">{tr.t('navInsurance')}</Link>
      <div>
        <h1 className="text-2xl font-bold">{tr.t('insMedTitle')}</h1>
        <p className="text-text-muted">{tr.t('insMedBody')}</p>
      </div>
      <MedicalQuotes
        locale={tr.locale}
        defaultPrimaryDob={dateOfBirthForAge(MEDICAL_DEFAULT_PRIMARY_AGE, today)}
        defaultSpouseDob={dateOfBirthForAge(MEDICAL_DEFAULT_PRIMARY_AGE - 2, today)}
        defaultChildDob={dateOfBirthForAge(5, today)}
      />
    </div>
  );
}
