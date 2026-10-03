import { demoCustomer, type CustomerOverview } from './account';
import { preApprove, type CustomerFinancials } from './affordability';
import { cardOffers, type CardOffer } from './cards';
import type { EKeyIdentity, OnboardingPreApproval } from './onboarding';

/**
 * The signed-in customer's profile (⚠️ SANDBOX stand-in for an eKey / OIDC login and the core-banking record).
 *
 * Every sandbox session starts as the demo customer. Completing onboarding (POST /onboarding/pre-approval)
 * stores that customer's own financials and pre-approval here, and from then on /me, the home page, card
 * eligibility and finance decisions use their numbers. Pure functions only: the store that keeps one profile
 * per session lives with the API (apps/web/lib/session.ts).
 */
export interface CustomerProfile {
  /** Opaque customer id. Never the session id, because it is returned by the API (e.g. on applications). */
  customerId: string;
  /** ⚠️ Sandbox eKey identity from onboarding step 1, if the customer logged in */
  identity?: Pick<EKeyIdentity, 'name' | 'cprMasked' | 'nationality'>;
  /** Set when onboarding finished with a pre-approval */
  onboarding?: {
    financials: CustomerFinancials;
    result: OnboardingPreApproval;
    completedAt: string;
  };
  /**
   * Contracts this customer has settled early (⚠️ sandbox: recorded by SandboxContractSettings, set on the profile by
   * the session with withSettledContracts). Their installments no longer count as existing obligations.
   */
  settledContractIds?: string[];
}

/** API representation of the customer (GET /api/v1/me). */
export interface CustomerView extends CustomerOverview {
  /** false while the session is still the demo customer */
  onboarded: boolean;
  /** Masked CPR from eKey (sandbox), when known */
  cprMasked?: string;
}

export function newCustomerProfile(customerId: string): CustomerProfile {
  return { customerId };
}

/** Records the (sandbox) eKey identity. Nothing else changes until onboarding completes. */
export function withIdentity(profile: CustomerProfile, identity: EKeyIdentity): CustomerProfile {
  const { name, cprMasked, nationality } = identity;
  return { ...profile, identity: { name, cprMasked, nationality } };
}

/** Stores the outcome of onboarding: from now on the customer's own financials and pre-approval apply. */
export function withOnboarding(
  profile: CustomerProfile,
  financials: CustomerFinancials,
  result: OnboardingPreApproval,
  now: Date = new Date(),
): CustomerProfile {
  const { monthlySalaryFils, existingObligationsFils } = financials;
  return {
    ...profile,
    onboarding: { financials: { monthlySalaryFils, existingObligationsFils }, result, completedAt: now.toISOString() },
  };
}

/** The profile with the contracts this customer has settled (so obligations, pre-approval and decisions exclude them). */
export function withSettledContracts(profile: CustomerProfile, contractIds: readonly string[]): CustomerProfile {
  if (!contractIds.length && !profile.settledContractIds) return profile;
  return { ...profile, settledContractIds: [...contractIds] };
}

/**
 * Monthly installments of the customer's settled contracts. ⚠️ Sandbox: the contracts are the demo account's, and a
 * self-declared obligations figure (onboarding) is assumed to include them, so it is reduced by the same amount.
 */
function settledInstallmentsFils(profile: CustomerProfile, demo: CustomerOverview): number {
  const settled = profile.settledContractIds ?? [];
  return demo.contracts.filter((c) => settled.includes(c.id)).reduce((s, c) => s + c.quote.monthlyFils, 0);
}

/**
 * Salary and obligations every decision uses: the customer's own after onboarding, otherwise the demo customer's.
 * Settled contracts no longer count: their installments are taken off the obligations (never below zero).
 */
export function customerFinancials(profile: CustomerProfile, today: Date = new Date()): CustomerFinancials {
  const demo = demoCustomer(today);
  const base = profile.onboarding
    ? profile.onboarding.financials
    : { monthlySalaryFils: demo.monthlySalaryFils, existingObligationsFils: demo.existingObligationsFils };
  return {
    monthlySalaryFils: base.monthlySalaryFils,
    existingObligationsFils: Math.max(0, base.existingObligationsFils - settledInstallmentsFils(profile, demo)),
  };
}

/**
 * The customer as the apps show them. Before onboarding: the demo customer. After: their name (from eKey, when
 * they logged in), salary, obligations and pre-approval.
 * ⚠️ Sandbox: contracts, garage and rewards stay the demo account's until core lending is integrated.
 */
export function customerOverview(profile: CustomerProfile, today: Date = new Date()): CustomerView {
  const demo = demoCustomer(today);
  const base: CustomerView = {
    ...demo,
    customerId: profile.customerId,
    onboarded: false,
    ...(profile.identity ? { cprMasked: profile.identity.cprMasked } : {}),
  };
  const done = profile.onboarding;
  const view: CustomerView = done
    ? {
        ...base,
        name: profile.identity?.name ?? demo.name,
        monthlySalaryFils: done.financials.monthlySalaryFils,
        existingObligationsFils: done.financials.existingObligationsFils,
        preApproval: done.result.preApproval,
        onboarded: true,
      }
    : base;
  if (settledInstallmentsFils(profile, demo) === 0) return view;
  // A settled contract frees DBR headroom: obligations and the pre-approval are recomputed without it.
  const financials = customerFinancials(profile, today);
  return { ...view, existingObligationsFils: financials.existingObligationsFils, preApproval: preApprove(financials, today) };
}

/** Every card product with this customer's eligibility and offered limit. */
export function customerCardOffers(profile: CustomerProfile, today: Date = new Date()): CardOffer[] {
  return cardOffers(customerFinancials(profile, today), today);
}
