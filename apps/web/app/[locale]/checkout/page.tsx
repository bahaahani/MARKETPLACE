import type { Metadata } from 'next';
import { isServerPricedPurpose, PAYMENT_PURPOSES, serverPaymentPrice } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { Checkout } from '@/components/Checkout';
import { resolveLocale } from '@/lib/i18n';
import { policyStore } from '@/lib/policy-store';
import { pageCustomer } from '@/lib/session';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'choosePaymentMethod'), robots: { index: false } };
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ amount?: string; purpose?: string; reference?: string; label?: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const sp = await searchParams;
  // A held insurance quote (of this session's customer) is paid at the premium the server priced, whatever the link says.
  const heldQuote =
    sp.purpose === 'insurance_premium' && sp.reference ? policyStore.getQuote(sp.reference, (await pageCustomer()).customerId) : undefined;
  // Server-priced purposes (reservation deposit, valuation fee) are paid at the server amount; the link's amount is ignored.
  const serverAmount = isServerPricedPurpose(sp.purpose) && sp.reference ? serverPriceOrNaN(sp.purpose, sp.reference) : undefined;
  const amountFils = heldQuote ? heldQuote.premiumFils : (serverAmount ?? Number(sp.amount));
  const purpose = PAYMENT_PURPOSES.find((p) => p === sp.purpose);
  if (!Number.isInteger(amountFils) || amountFils <= 0 || !purpose || !sp.reference) {
    return <p className="text-danger">{t(locale, 'errorGeneric')}</p>;
  }
  return (
    <Checkout
      locale={locale}
      amountFils={amountFils}
      purpose={purpose}
      reference={sp.reference}
      label={sp.label ?? sp.reference}
      serverPriced={serverAmount !== undefined}
    />
  );
}

function serverPriceOrNaN(purpose: string, reference: string): number {
  try {
    return serverPaymentPrice(purpose, reference).amountFils;
  } catch {
    return Number.NaN;
  }
}
