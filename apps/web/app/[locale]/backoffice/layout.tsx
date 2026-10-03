import Link from 'next/link';
import { can } from '@sahel/domain';
import { BackOfficeSignOut } from '@/components/BackOffice';
import { pageStaffSession } from '@/lib/backoffice-api';
import { BACKOFFICE_NAV, ROLE_LABEL } from '@/lib/backoffice-labels';
import { resolveLocale, translator } from '@/lib/i18n';

// The staff session comes from a cookie, so render per request.
export const dynamic = 'force-dynamic';

/**
 * Back-office chrome (staff tool, web only). ⚠️ Sandbox: the person picks a role (no staff login). Production
 * resolves the staff session from staff SSO (see staffSession in lib/backoffice-api.ts).
 */
export default async function BackOfficeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const staff = await pageStaffSession();
  const base = `/${tr.locale}/backoffice`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="me-auto">
          <p className="text-xs font-semibold text-brand">{tr.t('boTitle')}</p>
          {staff && (
            <p className="text-lg font-bold" data-testid="bo-staff" data-role={staff.role}>
              {staff.staffName} · {tr.t(ROLE_LABEL[staff.role])}
            </p>
          )}
        </div>
        {staff && (
          <nav className="flex flex-wrap gap-1" aria-label={tr.t('boTitle')}>
            {BACKOFFICE_NAV.filter((n) => can(staff.role, n.permission)).map((n) => (
              <Link key={n.path} href={`${base}${n.path}`} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-brand-soft" data-testid={n.testId}>
                {tr.t(n.label)}
              </Link>
            ))}
            <BackOfficeSignOut locale={tr.locale} />
          </nav>
        )}
      </div>
      <p className="rounded-[var(--radius-sm)] bg-accent/15 px-3 py-2 text-xs text-[#8a5c00]">{tr.t('boSandboxBanner')}</p>
      {children}
    </div>
  );
}
