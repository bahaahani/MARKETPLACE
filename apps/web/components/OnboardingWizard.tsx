'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CONSENT_SCOPES,
  CONSENT_VALIDITY_DAYS,
  isValidCpr,
  parseBhdInput,
  type ConsentScope,
  type EKeyIdentity,
  type OnboardingPreApproval,
  type ProductLine,
} from '@sahel/domain';
import type { AppLocale, MessageKey } from '@sahel/i18n';
import { translator } from '@/lib/i18n';

const STEPS: MessageKey[] = ['onboardingStepIdentity', 'onboardingStepEmployment', 'onboardingStepConsent', 'onboardingStepResult'];

const LIMIT_LABEL: Record<ProductLine, MessageKey> = {
  vehicle: 'preApprovalVehicle',
  personal: 'preApprovalPersonal',
  home: 'preApprovalHome',
};

const CONSENT_TEXT: Record<ConsentScope, { title: MessageKey; body: MessageKey }> = {
  CRB: { title: 'consentCrbTitle', body: 'consentCrbBody' },
  OPEN_BANKING: { title: 'consentObTitle', body: 'consentObBody' },
};

/** API error codes the wizard explains in the customer's language. */
const ERROR_TEXT: Partial<Record<string, MessageKey>> = {
  INVALID_CPR: 'cprInvalid',
  INVALID_SALARY: 'salaryInvalid',
  INVALID_OBLIGATIONS: 'obligationsInvalid',
  CONSENT_REQUIRED: 'consentRequired',
  CONSENT_EXPIRED: 'consentRequired',
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json()) as { data?: T; error?: { code: string } };
  if (!res.ok || !json.data) throw new Error(json.error?.code ?? 'INTERNAL');
  return json.data;
}

/**
 * Onboarding wizard (journey J1). Every decision is made by the API (the same one the Flutter app uses):
 * this component only collects input and renders results.
 * ⚠️ SANDBOX: eKey, CRB and Open Banking are simulated. See packages/domain/src/onboarding.ts.
 */
export function OnboardingWizard({ locale }: { locale: AppLocale }) {
  const tr = translator(locale);
  const [step, setStep] = useState(0);
  const [cpr, setCpr] = useState('');
  const [identity, setIdentity] = useState<EKeyIdentity | null>(null);
  const [employer, setEmployer] = useState('');
  const [salary, setSalary] = useState('');
  const [obligations, setObligations] = useState('0');
  const [consents, setConsents] = useState<Record<ConsentScope, boolean>>({ CRB: false, OPEN_BANKING: false });
  const [result, setResult] = useState<OnboardingPreApproval | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  function go(next: number) {
    setError(null);
    setStep(next);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(ERROR_TEXT[(e as Error).message] ?? 'errorGeneric');
    } finally {
      setBusy(false);
    }
  }

  function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidCpr(cpr)) return setError('cprInvalid');
    void run(async () => {
      setIdentity(await post<EKeyIdentity>('/api/v1/onboarding/ekey', { cpr }));
      // Keep only the masked CPR from here on.
      setCpr('');
      go(1);
    });
  }

  const salaryFils = parseBhdInput(salary);
  const obligationsFils = parseBhdInput(obligations);

  function submitEmployment(e: React.FormEvent) {
    e.preventDefault();
    if (!salaryFils) return setError('salaryInvalid');
    if (obligationsFils === undefined) return setError('obligationsInvalid');
    go(2);
  }

  function submitConsent(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const data = await post<OnboardingPreApproval>('/api/v1/onboarding/pre-approval', {
        monthlySalaryFils: salaryFils,
        existingObligationsFils: obligationsFils,
        employer,
        consentScopes: CONSENT_SCOPES.filter((s) => consents[s]),
      });
      setResult(data);
      go(3);
    });
  }

  function restart() {
    setCpr('');
    setIdentity(null);
    setEmployer('');
    setSalary('');
    setObligations('0');
    setConsents({ CRB: false, OPEN_BANKING: false });
    setResult(null);
    go(0);
  }

  const errorBox = error && (
    <p id="onboarding-error" role="alert" className="mt-3 text-sm text-danger" data-testid="onboarding-error">
      {tr.t(error)}
    </p>
  );
  const field = 'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2';

  return (
    <div className="mx-auto max-w-xl" data-testid="onboarding">
      <h1 className="text-2xl font-bold">{tr.t('onboardingTitle')}</h1>
      <p className="mb-4 text-text-muted">{tr.t('onboardingIntro')}</p>

      <ol className="mb-5 grid grid-cols-4 gap-2" aria-label={tr.t('stepOf', { current: step + 1, total: STEPS.length })}>
        {STEPS.map((key, i) => (
          <li key={key} aria-current={i === step ? 'step' : undefined} className="text-xs">
            <span className={`mb-1 block h-1.5 rounded-full ${i <= step ? 'bg-brand' : 'bg-border'}`} />
            <span className={i === step ? 'font-semibold text-brand' : 'text-text-muted'}>{tr.t(key)}</span>
          </li>
        ))}
      </ol>

      <section className="card p-5" aria-labelledby="onboarding-step-heading">
        <p className="text-xs text-text-muted">{tr.t('stepOf', { current: step + 1, total: STEPS.length })}</p>
        <h2 id="onboarding-step-heading" ref={heading} tabIndex={-1} className="mb-4 text-xl font-bold outline-none">
          {tr.t(STEPS[step]!)}
        </h2>

        {step === 0 && (
          <form onSubmit={submitIdentity} noValidate>
            <label className="block">
              <span className="font-medium">{tr.t('cprLabel')}</span>
              <input
                name="cpr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={9}
                dir="ltr"
                value={cpr}
                onChange={(e) => setCpr(e.target.value.replace(/\D/g, ''))}
                aria-invalid={error === 'cprInvalid'}
                aria-describedby="cpr-hint onboarding-error"
                className={field}
              />
              <span id="cpr-hint" className="mt-1 block text-xs text-text-muted">
                {tr.t('cprHint')}
              </span>
            </label>
            {errorBox}
            <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy} data-testid="ekey-login">
              {tr.t('ekeyLogin')}
            </button>
            {/* ⚠️ Sandbox: production uses the eKey OIDC redirect or a QR code scanned with the eKey app. */}
            <p className="mt-3 rounded-md bg-background p-2 text-center text-xs text-text-muted">⚠️ {tr.t('ekeySandboxNote')}</p>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={submitEmployment} noValidate className="space-y-4">
            {identity && (
              <dl className="grid grid-cols-2 gap-y-1 rounded-md bg-islamic-soft p-3 text-sm" data-testid="ekey-identity">
                <dt className="col-span-2 mb-1 font-semibold text-islamic">✓ {tr.t('ekeyVerified')}</dt>
                <dt className="text-text-muted">{tr.t('identityName')}</dt>
                <dd className="font-semibold">{identity.name[locale]}</dd>
                <dt className="text-text-muted">{tr.t('identityCpr')}</dt>
                <dd className="font-mono" dir="ltr">
                  {identity.cprMasked}
                </dd>
                <dt className="text-text-muted">{tr.t('identityNationality')}</dt>
                <dd>{identity.nationality[locale]}</dd>
              </dl>
            )}
            <label className="block">
              <span className="font-medium">{tr.t('employerLabel')}</span>
              <input name="employer" autoComplete="organization" value={employer} onChange={(e) => setEmployer(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className="font-medium">{tr.t('salaryLabel')}</span>
              <input
                name="salary"
                inputMode="decimal"
                dir="ltr"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                aria-invalid={error === 'salaryInvalid'}
                aria-describedby="onboarding-error"
                className={field}
              />
            </label>
            <label className="block">
              <span className="font-medium">{tr.t('obligationsLabel')}</span>
              <input
                name="obligations"
                inputMode="decimal"
                dir="ltr"
                value={obligations}
                onChange={(e) => setObligations(e.target.value)}
                aria-invalid={error === 'obligationsInvalid'}
                aria-describedby="obligations-hint onboarding-error"
                className={field}
              />
              <span id="obligations-hint" className="mt-1 block text-xs text-text-muted">
                {tr.t('obligationsHint')}
              </span>
            </label>
            {errorBox}
            <div className="flex gap-3">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => go(0)}>
                {tr.t('back')}
              </button>
              <button type="submit" className="btn btn-primary flex-1" data-testid="employment-continue">
                {tr.t('continueAction')}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submitConsent} noValidate>
            <p className="mb-3 text-sm">{tr.t('consentIntro')}</p>
            <fieldset className="space-y-2">
              <legend className="sr-only">{tr.t('onboardingStepConsent')}</legend>
              {CONSENT_SCOPES.map((s) => (
                <label key={s} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${consents[s] ? 'border-brand bg-brand-soft' : 'border-border'}`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={consents[s]}
                    onChange={(e) => setConsents({ ...consents, [s]: e.target.checked })}
                    aria-describedby={`consent-${s}-body`}
                    data-testid={`consent-${s}`}
                  />
                  <span>
                    <span className="block font-semibold">{tr.t(CONSENT_TEXT[s].title)}</span>
                    <span id={`consent-${s}-body`} className="block text-sm text-text-muted">
                      {tr.t(CONSENT_TEXT[s].body)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="mt-3 text-sm">⏱ {tr.t('consentExpiry', { days: CONSENT_VALIDITY_DAYS })}</p>
            {errorBox}
            <div className="mt-4 flex gap-3">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => go(1)}>
                {tr.t('back')}
              </button>
              <button type="submit" className="btn btn-primary flex-1" disabled={busy} data-testid="see-preapproval">
                {tr.t('seePreApproval')}
              </button>
            </div>
            {/* ⚠️ Sandbox: no CRB pull or Open Banking (AISP) call happens. */}
            <p className="mt-3 rounded-md bg-background p-2 text-center text-xs text-text-muted">⚠️ {tr.t('consentSandboxNote')}</p>
          </form>
        )}

        {step === 3 && result && (
          <div data-testid="onboarding-result">
            <div className="rounded-[var(--radius-lg)] bg-gradient-to-br from-brand-dark to-brand p-5 text-white">
              {identity && <p className="text-sm opacity-80">{tr.t('greeting', { name: identity.name[locale] })}</p>}
              <p className="text-2xl font-bold">{tr.t('preApprovedTitle')}</p>
              <p className="text-sm opacity-80">{tr.t('preApprovedSubtitle', { date: tr.date(result.preApproval.validUntil) })}</p>
              <p className="mt-3 font-semibold" data-testid="max-monthly">
                {tr.t('maxMonthlyAffordable', { amount: tr.money(result.preApproval.maxMonthlyFils, 0) })}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {result.preApproval.limits.map((l) => (
                  <div key={l.productLine} className="rounded-xl bg-white/10 p-3" data-testid={`limit-${l.productLine}`}>
                    <p className="text-xs opacity-80">{tr.t(LIMIT_LABEL[l.productLine])}</p>
                    <p className="font-bold">{tr.t('upTo', { amount: tr.money(l.maxFinanceFils, 0) })}</p>
                  </div>
                ))}
                <div className="rounded-xl bg-white/10 p-3" data-testid="limit-card">
                  <p className="text-xs opacity-80">{tr.t('preApprovalCard')}</p>
                  <p className="font-bold">{tr.money(result.preApproval.cardLimitFils, 0)}</p>
                </div>
              </div>
            </div>
            {result.preApproval.maxMonthlyFils === 0 && <p className="mt-3 text-sm text-danger">{tr.t('noHeadroom')}</p>}
            <p className="mt-3 text-xs text-text-muted">{tr.t('consentValidUntil', { date: tr.date(result.consent.expiresAt) })}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/${locale}/cars${result.preApproval.maxMonthlyFils > 0 ? `?maxMonthlyFils=${result.preApproval.maxMonthlyFils}` : ''}`}
                className="btn btn-primary flex-1"
                data-testid="browse-budget"
              >
                {tr.t('browseCarsBudget')}
              </Link>
              <Link href={`/${locale}/cards`} className="btn btn-ghost flex-1">
                {tr.t('navCards')}
              </Link>
            </div>
            <button type="button" className="mt-3 w-full text-sm text-brand underline" onClick={restart}>
              {tr.t('startOver')}
            </button>
            <p className="mt-3 text-center text-xs text-text-muted">⚠️ {tr.t('illustrativeDisclaimer')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
