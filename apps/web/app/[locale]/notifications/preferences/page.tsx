import type { Metadata } from 'next';
import { notificationPreferencesView } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { NotificationPreferencesForm } from '@/components/NotificationPreferencesForm';
import { resolveLocale } from '@/lib/i18n';
import { notificationStore } from '@/lib/notifications-store';
import { pageCustomer } from '@/lib/session';

// The session customer's preferences, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'notifPrefsTitle') };
}

export default async function NotificationPreferencesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const me = await pageCustomer();
  return <NotificationPreferencesForm locale={locale} initial={notificationPreferencesView(notificationStore.preferences(me.customerId))} />;
}
