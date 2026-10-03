import { homeQuotes, type HomeQuoteInput } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleInsuranceError } from '@/lib/policy-store';

/**
 * POST /api/v1/insurance/home-quotes: home (building and/or contents) comparison, cheapest first (⚠️ demo insurers).
 * With only a propertyId, the sums insured are suggested from the listing; `input` echoes what was priced.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<Partial<HomeQuoteInput>>(req);
    return ok(
      homeQuotes({
        propertyType: body.propertyType,
        buildingSumInsuredFils: body.buildingSumInsuredFils,
        contentsSumInsuredFils: body.contentsSumInsuredFils,
        propertyId: body.propertyId,
        takafulOnly: body.takafulOnly === true,
      }),
    );
  } catch (e) {
    return handleInsuranceError(e);
  }
}
