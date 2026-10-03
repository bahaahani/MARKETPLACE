import { buildPreApproval, grantConsent } from '@sahel/domain';
import { handleError, ok } from '@/lib/api';

interface Body {
  monthlySalaryFils?: number;
  existingObligationsFils?: number;
  employer?: unknown;
  consentScopes?: unknown;
}

/**
 * POST /api/v1/onboarding/pre-approval: salary + obligations + consents → live pre-approval.
 * Missing or partial consent is rejected with 422 CONSENT_REQUIRED.
 * ⚠️ SANDBOX: obligations are self-declared; production pulls them from the CRB and verifies the
 * salary through Open Banking under the consent recorded here.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const scopes = Array.isArray(body.consentScopes) ? body.consentScopes.filter((s): s is string => typeof s === 'string') : [];
    const consent = scopes.length ? grantConsent(scopes) : undefined;
    const result = buildPreApproval(
      {
        monthlySalaryFils: body.monthlySalaryFils as number,
        existingObligationsFils: body.existingObligationsFils ?? 0,
        employer: typeof body.employer === 'string' ? body.employer.slice(0, 120) : undefined,
      },
      consent,
    );
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
