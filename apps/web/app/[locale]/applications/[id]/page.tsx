import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { applicationView } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { AcceptOffer } from '@/components/AcceptOffer';
import { applicationTitle, DecisionCard, OfferSummary, Timeline } from '@/components/Application';
import { originations } from '@/lib/api';
import { resolveLocale, translator } from '@/lib/i18n';

// Live application state (sandbox store), so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'applicationTitle'), robots: { index: false } };
}

export default async function ApplicationPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const tr = translator(resolveLocale(raw));
  const found = originations.get(id);
  if (!found) notFound();
  const app = applicationView(found);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-text-muted">{tr.t('applicationTitle')}</p>
        <h1 className="text-2xl font-bold">{applicationTitle(app, tr)}</h1>
        <p className="font-mono text-xs text-text-muted">{tr.t('applicationReference', { id: app.id })}</p>
      </header>
      {/* Phones: decision, offer, then progress. Desktop: offer in a sticky side column. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:grid-rows-[auto_1fr] lg:items-start">
        <DecisionCard app={app} tr={tr} />
        <div className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <OfferSummary app={app} tr={tr} />
          {app.status === 'APPROVED' && <AcceptOffer locale={tr.locale} applicationId={app.id} />}
        </div>
        <Timeline steps={app.steps} tr={tr} />
      </div>
    </div>
  );
}
