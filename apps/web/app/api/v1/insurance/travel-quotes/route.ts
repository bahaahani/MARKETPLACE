import { travelQuotes, withTravelDefaults, type TravelQuoteInput } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleInsuranceError } from '@/lib/policy-store';

/** POST /api/v1/insurance/travel-quotes: travel insurance comparison, cheapest first (⚠️ demo insurers). */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<Partial<TravelQuoteInput>>(req);
    return ok({ quotes: travelQuotes(withTravelDefaults(body)) });
  } catch (e) {
    return handleInsuranceError(e);
  }
}
