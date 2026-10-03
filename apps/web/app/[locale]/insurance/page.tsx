import type { Metadata } from 'next';
import Link from 'next/link';
import { demoCustomer, findVehicle } from '@sahel/domain';
import { t, type MessageKey } from '@sahel/i18n';
import { InsuranceQuotes } from '@/components/InsuranceQuotes';
import { resolveLocale, translator } from '@/lib/i18n';

// Personalized (customer data and due dates), so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'navInsurance') };
}

const LINES: { id: 'motor' | 'travel' | 'home'; icon: string; title: MessageKey; body: MessageKey; href: string }[] = [
  { id: 'motor', icon: '🚗', title: 'insMotorTitle', body: 'insMotorBody', href: '#motor' },
  { id: 'travel', icon: '✈️', title: 'insTravelTitle', body: 'insTravelBody', href: '/insurance/travel' },
  { id: 'home', icon: '🏠', title: 'insHomeTitle', body: 'insHomeBody', href: '/insurance/home' },
];

/** Insurance hub: motor, travel and home, each comparing several insurers (Tasheelat Insurance is a broker). */
export default async function InsurancePage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  // Quote for the customer's own car from My Garage (Islamic finance customers default to Takaful).
  const me = demoCustomer();
  const garage = me.garage[0];
  const vehicle = garage ? findVehicle(garage.vehicleId) : undefined;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{tr.t('navInsurance')}</h1>
        <p className="text-text-muted">{tr.t('insHubSubtitle')}</p>
      </div>
      <nav className="grid gap-3 sm:grid-cols-3" aria-label={tr.t('navInsurance')}>
        {LINES.map((l) => (
          <Link
            key={l.id}
            href={l.href.startsWith('#') ? l.href : `/${tr.locale}${l.href}`}
            className="card block p-4 transition hover:border-brand"
            data-testid={`insurance-line-${l.id}`}
          >
            <span className="text-2xl" aria-hidden>{l.icon}</span>
            <h2 className="mt-1 font-bold">{tr.t(l.title)}</h2>
            <p className="text-sm text-text-muted">{tr.t(l.body)}</p>
          </Link>
        ))}
      </nav>
      {garage && vehicle && (
        <div id="motor" className="scroll-mt-20 space-y-2">
          <p className="text-text-muted">
            {garage.title} · {tr.t('insuranceExpiry', { date: tr.date(garage.insuranceExpiry) })}
          </p>
          <InsuranceQuotes locale={tr.locale} vehicleValueFils={vehicle.priceFils} reference={garage.plate} defaultTakaful />
        </div>
      )}
      <p className="text-xs text-text-muted">{tr.t('insSandboxNote')}</p>
    </div>
  );
}
