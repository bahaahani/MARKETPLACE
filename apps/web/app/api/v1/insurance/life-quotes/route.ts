import { lifeQuotes, withLifeDefaults, type LifeQuoteInput } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleInsuranceError } from '@/lib/policy-store';

/**
 * POST /api/v1/insurance/life-quotes: term life comparison, cheapest first (⚠️ demo insurers, indicative only).
 * Beneficiaries are not part of the quote; they are collected when the policy is issued.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<Partial<LifeQuoteInput>>(req);
    return ok({ quotes: lifeQuotes(withLifeDefaults(body)) });
  } catch (e) {
    return handleInsuranceError(e);
  }
}
