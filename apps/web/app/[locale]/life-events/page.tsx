import type { Metadata } from 'next';
import { LIFE_EVENTS } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { LifeEventTile } from '@/components/BundlesLifeEvent';
import { resolveLocale, translator } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'lifeEventsTitle') };
}

export default async function LifeEventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('lifeEventsTitle')}</h1>
        <p className="mt-1 text-text-muted">{tr.t('lifeEventsIntro')}</p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {LIFE_EVENTS.map((e) => (
          <LifeEventTile key={e.id} e={e} tr={tr} />
        ))}
      </div>
      <p className="text-xs text-text-muted">{tr.t('lifeRulesNote')}</p>
    </div>
  );
}
