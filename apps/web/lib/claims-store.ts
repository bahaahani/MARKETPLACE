import { CLAIM_ERROR_STATUS, CLAIM_MAX_BODY_BYTES, ClaimError, SandboxClaimStore } from '@sahel/domain';
import { handleError, problem } from '@/lib/api';
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
 * Reads a claim JSON body with a size cap (photos make it large): Content-Length is checked before reading, and the
 * text length after, so a lying or missing header cannot get past it.
 */
export async function claimBody<T extends object>(req: Request): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > CLAIM_MAX_BODY_BYTES) throw new BodyTooLargeError();
  const text = await req.text();
  if (text.length > CLAIM_MAX_BODY_BYTES) throw new BodyTooLargeError();
  const body: unknown = JSON.parse(text);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new SyntaxError('request body must be a JSON object');
  return body as T;
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
