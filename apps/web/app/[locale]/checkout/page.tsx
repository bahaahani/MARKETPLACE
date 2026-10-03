import type { Metadata } from 'next';
import type { PaymentPurpose } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { Checkout } from '@/components/Checkout';
import { resolveLocale } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'choosePaymentMethod'), robots: { index: false } };
}

const PURPOSES: PaymentPurpose[] = ['reservation_deposit', 'installment', 'insurance_premium', 'early_settlement', 'valuation_fee'];

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ amount?: string; purpose?: string; reference?: string; label?: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const sp = await searchParams;
  const amountFils = Number(sp.amount);
  const purpose = PURPOSES.find((p) => p === sp.purpose);
  if (!Number.isInteger(amountFils) || amountFils <= 0 || !purpose || !sp.reference) {
    return <p className="text-danger">{t(locale, 'errorGeneric')}</p>;
  }
  return <Checkout locale={locale} amountFils={amountFils} purpose={purpose} reference={sp.reference} label={sp.label ?? sp.reference} />;
}
