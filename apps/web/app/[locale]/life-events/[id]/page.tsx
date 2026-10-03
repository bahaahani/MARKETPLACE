import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildLifeEventBundle, customerFinancials, findLifeEvent, isBundleStructure } from '@sahel/domain';
import { BundleItemRow, BundleStructureToggle, BundleSummary } from '@/components/BundlesLifeEvent';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomer } from '@/lib/session';

// Priced against the customer's DBR headroom, so render per request.
export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, id } = await params;
  const event = findLifeEvent(id);
  return { title: event ? event.title[resolveLocale(locale)] : undefined };
}

export default async function LifeEventPage({ params, searchParams }: { params: Params; searchParams: Promise<{ structure?: string }> }) {
  const { locale, id } = await params;
  const tr = translator(resolveLocale(locale));
  if (!findLifeEvent(id)) notFound();
  const sp = await searchParams;
  const structure = isBundleStructure(sp.structure) ? sp.structure : 'islamic';
  // The session customer's financials (their own after onboarding), as GET /life-events/{id}/bundle uses.
  const b = buildLifeEventBundle(id, structure, customerFinancials(await pageCustomer()));

  return (
    <div className="mx-auto max-w-3xl space-y-5" data-testid="life-event-bundle" data-structure={structure}>
      <Link href={`/${tr.locale}/life-events`} className="text-sm font-semibold text-brand">
        <span aria-hidden className="inline-block rtl:rotate-180">←</span> {tr.t('lifeAllEvents')}
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          <span aria-hidden>{b.event.icon}</span> {b.event.title[tr.locale]}
        </h1>
        <BundleStructureToggle eventId={id} structure={structure} tr={tr} />
      </header>
      <BundleSummary b={b} tr={tr} />
      <div className="space-y-3">
        {b.items.map((item) => (
          <BundleItemRow key={item.id} item={item} tr={tr} />
        ))}
      </div>
      <p className="text-xs text-text-muted">{tr.t('lifeIllustrative')}</p>
      <p className="text-xs text-text-muted">{tr.t('lifeRulesNote')}</p>
    </div>
  );
}
