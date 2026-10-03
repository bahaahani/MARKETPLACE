import type { Metadata } from 'next';
import { CARDS, demoCustomer } from '@sahel/domain';
import { t } from '@sahel/i18n';
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
              <div className="flex aspect-[1.586] flex-col justify-between p-5 text-white" style={{ background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]})` }}>
                <span className="text-sm font-semibold tracking-wide">IMTIAZ</span>
                <div className="flex items-end justify-between">
                  <span className="text-xs opacity-80">{c.tier.toUpperCase()}</span>
                  <span aria-label="Mastercard" className="flex">
                    <span className="h-6 w-6 rounded-full bg-[#eb001b]" />
                    <span className="-ms-2 h-6 w-6 rounded-full bg-[#f79e1b] opacity-90" />
                  </span>
                </div>
              </div>
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
                <button type="button" className="btn btn-primary w-full" disabled={!eligible}>
                  {tr.t('applyInstantly')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
