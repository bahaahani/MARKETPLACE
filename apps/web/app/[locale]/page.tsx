import Link from 'next/link';
import { customerOverview, PROPERTIES, searchProperties, searchVehicles, VEHICLES, type ProductLine } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';
import { PropertyCard, VehicleCard } from '@/components/Listings';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomer } from '@/lib/session';

// Personalized (customer data and due dates), so render per request.
export const dynamic = 'force-dynamic';

const LIMIT_LABEL: Record<ProductLine, MessageKey> = {
  vehicle: 'preApprovalVehicle',
  personal: 'preApprovalPersonal',
  home: 'preApprovalHome',
};

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  // The session's customer: their own pre-approval once onboarding is done (⚠️ sandbox session).
  const me = customerOverview(await pageCustomer());
  const pa = me.preApproval;
  // "Cars within your budget": filtered by the customer's DBR headroom.
  const cars = searchVehicles(VEHICLES, { maxMonthlyFils: pa.maxMonthlyFils }).slice(0, 3);
  const homes = searchProperties(PROPERTIES, { purpose: 'sale' }).slice(0, 3);

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-brand-dark to-brand p-6 text-white md:p-8" data-testid="preapproval">
        <p className="text-sm opacity-80">{tr.t('greeting', { name: me.name[tr.locale] })}</p>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">{tr.t('preApprovedTitle')}</h1>
        <p className="text-sm opacity-80">{tr.t('preApprovedSubtitle', { date: tr.date(pa.validUntil) })}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {pa.limits.map((l) => {
            const tile = (
              <>
                <p className="text-xs opacity-80">{tr.t(LIMIT_LABEL[l.productLine])}</p>
                <p className="text-lg font-bold">{tr.t('upTo', { amount: tr.money(l.maxFinanceFils, 0) })}</p>
              </>
            );
            // Personal finance has no listing to start from, so its tile is the entry point.
            return l.productLine === 'personal' ? (
              <Link key={l.productLine} href={`/${tr.locale}/finance/personal`} className="rounded-xl bg-white/10 p-4 hover:bg-white/20" data-testid="personal-finance-link">
                {tile}
              </Link>
            ) : (
              <div key={l.productLine} className="rounded-xl bg-white/10 p-4">
                {tile}
              </div>
            );
          })}
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs opacity-80">{tr.t('preApprovalCard')}</p>
            <p className="text-lg font-bold">{tr.money(pa.cardLimitFils, 0)}</p>
          </div>
        </div>
      </section>

      <Link
        href={`/${tr.locale}/onboarding`}
        className="card flex items-center gap-4 p-5 transition hover:shadow-lg"
        data-testid="onboarding-cta"
      >
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-soft text-2xl">
          ✓
        </span>
        <span className="flex-1">
          <span className="block font-bold">{tr.t('onboardingTitle')}</span>
          <span className="block text-sm text-text-muted">{tr.t('onboardingIntro')}</span>
        </span>
        <span className="font-semibold text-brand">
          {tr.t('onboardingStart')} <span className="inline-block rtl:rotate-180">→</span>
        </span>
      </Link>

      <Section title={tr.t('featuredCars')} href={`/${tr.locale}/cars?maxMonthlyFils=${pa.maxMonthlyFils}`} more={tr.t('seeAll')}>
        {cars.map((v) => (
          <VehicleCard key={v.id} v={v} tr={tr} />
        ))}
      </Section>

      <Section title={tr.t('featuredProperty')} href={`/${tr.locale}/property`} more={tr.t('seeAll')}>
        {homes.map((p) => (
          <PropertyCard key={p.id} p={p} tr={tr} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, href, more, children }: { title: string; href: string; more: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-brand">
          {more} <span className="inline-block rtl:rotate-180">→</span>
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
