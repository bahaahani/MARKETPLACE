import { CLAIM_ERROR_STATUS, CLAIM_MAX_BODY_BYTES, ClaimError, SandboxClaimStore } from '@sahel/domain';
import { handleError, jsonBody, PayloadTooLargeError, problem } from '@/lib/api';
import { policyStore } from '@/lib/policy-store';

const g = globalThis as unknown as { __sahelClaims?: SandboxClaimStore };

/**
 * ⚠️ Sandbox motor claims (in memory, lost on restart), standing in for the broker's claims platform and the
 * insurer's claims API. Claims belong to the session customer and are filed against that customer's policies in the
 * policy store. Photos are validated and discarded (metadata only); see packages/domain/src/claims.ts.
 */
export const claimStore = (g.__sahelClaims ??= new SandboxClaimStore((customerId) => policyStore.list(customerId)));

/** Thrown for a POST /claims body over CLAIM_MAX_BODY_BYTES (413). */
export class BodyTooLargeError extends Error {
  constructor() {
    super(`request body is over ${CLAIM_MAX_BODY_BYTES} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Reads a claim JSON body with a size cap (photos make it large). The cap is enforced while streaming (jsonBody), so
 * a lying or missing Content-Length (chunked upload) cannot make the server buffer more than CLAIM_MAX_BODY_BYTES.
 */
export async function claimBody<T extends object>(req: Request): Promise<T> {
  try {
    return await jsonBody<T>(req, { maxBytes: CLAIM_MAX_BODY_BYTES });
  } catch (e) {
    if (e instanceof PayloadTooLargeError || (e instanceof Error && e.name === 'PayloadTooLargeError')) throw new BodyTooLargeError();
    throw e;
  }
}

/** handleError plus the claim errors (matched by name too: the store may come from another route's bundle). */
export function handleClaimError(e: unknown) {
  if (e instanceof ClaimError || (e instanceof Error && e.name === 'ClaimError')) {
    const code = (e as ClaimError).code;
    return problem(CLAIM_ERROR_STATUS[code] ?? 422, code, e.message);
  }
  if (e instanceof BodyTooLargeError || (e instanceof Error && e.name === 'BodyTooLargeError')) {
    return problem(413, 'BODY_TOO_LARGE', e.message);
  }
  return handleError(e);
}
