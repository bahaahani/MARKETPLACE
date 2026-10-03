import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auditEntries, AUDIT_TYPES, can, isAuditType } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { auditLog, pageStaffSession } from '@/lib/backoffice-api';
import { AUDIT_LABEL, ROLE_LABEL } from '@/lib/backoffice-labels';
import { resolveLocale, translator } from '@/lib/i18n';

// Live sandbox store, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'boAuditTitle'), robots: { index: false } };
}

/** Audit log (compliance viewer, read-only), filterable by action type with ?type=. */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const tr = translator(resolveLocale((await params).locale));
  const staff = await pageStaffSession();
  if (!staff) redirect(`/${tr.locale}/backoffice`);
  if (!can(staff.role, 'audit.read')) return <p className="text-danger" data-testid="bo-forbidden">{tr.t('boForbidden')}</p>;

  const raw = (await searchParams).type;
  const type = isAuditType(raw) ? raw : undefined;
  const items = auditEntries(staff, auditLog, type);
  const when = new Intl.DateTimeFormat(tr.locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bahrain',
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('boAuditTitle')}</h1>
        <p className="mt-1 text-sm text-text-muted">{tr.t('boAuditSubtitle')}</p>
      </header>
      {/* A plain GET form: works without JavaScript, and the filter is in the URL. */}
      <form className="flex flex-wrap items-end gap-2" method="get" data-testid="bo-audit-filter">
        <label className="text-sm">
          <span className="block text-xs text-text-muted">{tr.t('boAuditFilter')}</span>
          <select name="type" defaultValue={type ?? ''} className="rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm" data-testid="bo-audit-type">
            <option value="">{tr.t('boAuditAll')}</option>
            {AUDIT_TYPES.map((x) => (
              <option key={x} value={x}>
                {tr.t(AUDIT_LABEL[x])}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-ghost px-3 py-2 text-sm" data-testid="bo-audit-apply">
          {tr.t('boAuditApply')}
        </button>
      </form>
      {items.length === 0 ? (
        <p className="card p-4 text-sm text-text-muted" data-testid="bo-audit-empty">{tr.t('boAuditEmpty')}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm" data-testid="bo-audit-table">
            <thead className="bg-background text-xs text-text-muted">
              <tr>
                <th className="p-3 text-start font-semibold">{tr.t('boColWhen')}</th>
                <th className="p-3 text-start font-semibold">{tr.t('boColWho')}</th>
                <th className="p-3 text-start font-semibold">{tr.t('boAuditFilter')}</th>
                <th className="p-3 text-start font-semibold">{tr.t('boColSubject')}</th>
                <th className="p-3 text-end font-semibold">{tr.t('boColAmount')}</th>
                <th className="p-3 text-start font-semibold">{tr.t('boColNote')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t border-border align-top" data-testid="bo-audit-row" data-type={e.type}>
                  <td className="whitespace-nowrap p-3">
                    <time dateTime={e.at}>{when.format(new Date(e.at))}</time>
                  </td>
                  <td className="p-3">
                    <p className="font-semibold">{e.staffName}</p>
                    <p className="text-xs text-text-muted">{tr.t(ROLE_LABEL[e.role])}</p>
                  </td>
                  <td className="p-3">{tr.t(AUDIT_LABEL[e.type])}</td>
                  <td className="p-3 font-mono text-xs">{e.subject?.id ?? '–'}</td>
                  <td className="whitespace-nowrap p-3 text-end">{e.amountFils !== undefined ? tr.money(e.amountFils) : '–'}</td>
                  <td className="p-3" data-testid="bo-audit-note">{e.note ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
