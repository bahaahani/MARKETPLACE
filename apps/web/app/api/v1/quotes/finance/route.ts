import { compareStructures, financeLimits, quoteFinance, type FinanceStructure, type ProductLine } from '@sahel/domain';
import { handleError, ok, problem } from '@/lib/api';

const LINES: ProductLine[] = ['vehicle', 'personal', 'home'];

/**
 * POST /api/v1/quotes/finance
 * { productLine, assetPriceFils, downPaymentFils, tenureMonths, structure? }
 * Without `structure`, returns every offered structure side by side.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      productLine?: ProductLine;
      assetPriceFils?: number;
      downPaymentFils?: number;
      tenureMonths?: number;
      structure?: FinanceStructure;
    };
    if (!body.productLine || !LINES.includes(body.productLine)) return problem(400, 'BAD_REQUEST', 'productLine is required');
    if (typeof body.assetPriceFils !== 'number' || typeof body.tenureMonths !== 'number') {
      return problem(400, 'BAD_REQUEST', 'assetPriceFils and tenureMonths are required numbers');
    }
    const input = {
      productLine: body.productLine,
      assetPriceFils: body.assetPriceFils,
      downPaymentFils: body.downPaymentFils ?? 0,
      tenureMonths: body.tenureMonths,
    };
    const quotes = body.structure ? [quoteFinance({ ...input, structure: body.structure })] : compareStructures(input);
    return ok({ quotes, limits: financeLimits(input.productLine, input.assetPriceFils) });
  } catch (e) {
    return handleError(e);
  }
}
