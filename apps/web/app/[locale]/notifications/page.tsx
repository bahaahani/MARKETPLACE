import type { Metadata } from 'next';
import { t } from '@sahel/i18n';
import { NotificationsInbox } from '@/components/NotificationsInbox';
import { resolveLocale } from '@/lib/i18n';
import { customerInbox } from '@/lib/notifications';
import { pageCustomer } from '@/lib/session';

// Personalized and derived from today's Bahrain date, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'notifTitle') };
}

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  // The session customer's inbox (⚠️ sandbox session until eKey login).
  return <NotificationsInbox key={Date.now()} locale={locale} initial={customerInbox(await pageCustomer())} />;
}
