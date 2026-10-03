import type { Metadata } from 'next';
import { t } from '@sahel/i18n';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { resolveLocale } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'onboardingTitle'), robots: { index: false } };
}

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  return <OnboardingWizard locale={locale} />;
}
