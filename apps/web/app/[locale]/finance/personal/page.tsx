import type { Metadata } from 'next';
import { customerOverview, personalFinanceRange } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { PersonalFinance } from '@/components/PersonalFinance';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomer } from '@/lib/session';

// Personalized (the slider stops at the customer's pre-approved limit), so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'personalFinanceTitle') };
}

export default async function PersonalFinancePage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const range = personalFinanceRange(customerOverview(await pageCustomer()).preApproval);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('personalFinanceTitle')}</h1>
        <p className="text-text-muted">{tr.t('personalFinanceSubtitle')}</p>
        <p className="mt-1 text-sm font-semibold text-brand">{tr.t('upTo', { amount: tr.money(range.preApprovedFils, 0) })}</p>
      </header>
      <PersonalFinance locale={tr.locale} range={range} />
    </div>
  );
}
