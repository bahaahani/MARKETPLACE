import { medicalQuotes, withMedicalDefaults, type MedicalQuoteInput } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleInsuranceError } from '@/lib/policy-store';

/**
 * POST /api/v1/insurance/medical-quotes: medical insurance comparison, cheapest first (⚠️ demo insurers).
 * Indicative only: no medical underwriting. A pre-existing conditions declaration adds a surcharge or refers the quote.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<Partial<MedicalQuoteInput>>(req);
    return ok({ quotes: medicalQuotes(withMedicalDefaults(body)) });
  } catch (e) {
    return handleInsuranceError(e);
  }
}
