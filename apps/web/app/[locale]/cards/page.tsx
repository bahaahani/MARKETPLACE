import type { Metadata } from 'next';
import Link from 'next/link';
import { CARDS, demoCustomer } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { CardArt } from '@/components/CardArt';
import { resolveLocale, translator } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'cardsTitle') };
}

export default async function CardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const salary = demoCustomer().monthlySalaryFils;
  return (
    <div>
      <h1 className="text-2xl font-bold">{tr.t('cardsTitle')}</h1>
      <p className="mb-6 text-text-muted">{tr.t('applyInstantly')}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => {
          const eligible = salary >= c.minSalaryFils;
          return (
            <article key={c.id} className="card overflow-hidden" data-testid="card-product">
              <CardArt gradient={c.gradient} tier={c.tier} />
              <div className="space-y-2 p-4">
                <h2 className="font-semibold">{c.name[tr.locale]}</h2>
                <ul className="list-inside list-disc text-sm text-text-muted">
                  {c.highlights.map((h) => (
                    <li key={h.en}>{h[tr.locale]}</li>
                  ))}
                </ul>
                <dl className="grid grid-cols-2 text-sm">
                  <dt className="text-text-muted">{tr.t('annualFee')}</dt>
                  <dd className="text-end font-semibold">{c.annualFeeFils === 0 ? tr.t('free') : tr.money(c.annualFeeFils, 0)}</dd>
                  <dt className="text-text-muted">{tr.t('minSalary')}</dt>
                  <dd className="text-end font-semibold">{c.minSalaryFils === 0 ? '—' : tr.money(c.minSalaryFils, 0)}</dd>
                </dl>
                {eligible ? (
                  <Link href={`/${tr.locale}/cards/${c.id}/apply`} className="btn btn-primary w-full" data-testid={`apply-${c.id}`}>
                    {tr.t('applyInstantly')}
                  </Link>
                ) : (
                  <button type="button" className="btn btn-primary w-full" disabled>
                    {tr.t('applyInstantly')}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
