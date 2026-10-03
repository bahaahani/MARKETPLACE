import type { Metadata } from 'next';
import { demoCustomer, findVehicle } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { InsuranceQuotes } from '@/components/InsuranceQuotes';
import { resolveLocale, translator } from '@/lib/i18n';

// Personalized (customer data and due dates), so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'navInsurance') };
}

export default async function InsurancePage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  // Quote for the customer's own car from My Garage (Islamic finance customers default to Takaful).
  const me = demoCustomer();
  const garage = me.garage[0];
  const vehicle = garage ? findVehicle(garage.vehicleId) : undefined;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">{tr.t('navInsurance')}</h1>
      {garage && vehicle && (
        <>
          <p className="text-text-muted">
            {garage.title} · {tr.t('insuranceExpiry', { date: tr.date(garage.insuranceExpiry) })}
          </p>
          <InsuranceQuotes locale={tr.locale} vehicleValueFils={vehicle.priceFils} reference={garage.plate} defaultTakaful />
        </>
      )}
    </div>
  );
}
