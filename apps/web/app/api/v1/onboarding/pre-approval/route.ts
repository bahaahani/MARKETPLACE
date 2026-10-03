import { buildPreApproval, grantConsent, withOnboarding } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

interface Body {
  monthlySalaryFils?: number;
  existingObligationsFils?: number;
  employer?: unknown;
  consentScopes?: unknown;
}

/**
 * POST /api/v1/onboarding/pre-approval: salary + obligations + consents → live pre-approval.
 * Missing or partial consent is rejected with 422 CONSENT_REQUIRED.
 * On success the customer session keeps these financials and the pre-approval: from then on /me, the home page,
 * card eligibility and finance decisions use them.
 * ⚠️ SANDBOX: obligations are self-declared; production pulls them from the CRB and verifies the
 * salary through Open Banking under the consent recorded here.
 */
export function POST(req: Request) {
  return withCustomer(req, async (s) => {
    const body = await jsonBody<Body>(req);
    const scopes = Array.isArray(body.consentScopes) ? body.consentScopes.filter((x): x is string => typeof x === 'string') : [];
    const consent = scopes.length ? grantConsent(scopes) : undefined;
    const employment = {
      monthlySalaryFils: body.monthlySalaryFils as number,
      existingObligationsFils: body.existingObligationsFils ?? 0,
      employer: typeof body.employer === 'string' ? body.employer.slice(0, 120) : undefined,
    };
    const result = buildPreApproval(employment, consent);
    s.update((p) => withOnboarding(p, employment, result));
    return ok(result);
  });
}
