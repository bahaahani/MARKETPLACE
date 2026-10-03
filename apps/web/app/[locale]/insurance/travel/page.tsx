import type { Metadata } from 'next';
import Link from 'next/link';
import { addDaysIso, bahrainToday, TRAVEL_DEFAULT_START_IN_DAYS, TRAVEL_DEFAULT_TRIP_DAYS } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { TravelQuotes } from '@/components/TravelQuotes';
import { resolveLocale, translator } from '@/lib/i18n';

// Default trip dates depend on today's date in Bahrain, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'insTravelTitle') };
}

export default async function TravelInsurancePage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  // Starting point shared with the app (GET /config insurance.travel): a week-long trip a week from today (Bahrain date).
  const start = addDaysIso(bahrainToday(), TRAVEL_DEFAULT_START_IN_DAYS);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/${tr.locale}/insurance`} className="text-sm font-semibold text-brand">{tr.t('navInsurance')}</Link>
      <div>
        <h1 className="text-2xl font-bold">{tr.t('insTravelTitle')}</h1>
        <p className="text-text-muted">{tr.t('insTravelBody')}</p>
      </div>
      <TravelQuotes locale={tr.locale} defaultStart={start} defaultEnd={addDaysIso(start, TRAVEL_DEFAULT_TRIP_DAYS - 1)} />
    </div>
  );
}
