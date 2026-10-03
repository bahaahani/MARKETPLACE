import { compareStructures, financeLimits, quoteFinance, type FinanceStructure, type ProductLine } from '@sahel/domain';
import { handleError, jsonBody, ok, problem } from '@/lib/api';

const LINES: ProductLine[] = ['vehicle', 'personal', 'home'];

/**
 * POST /api/v1/quotes/finance
 * { productLine, assetPriceFils, downPaymentFils?, tenureMonths?, structure? }
 * Without `structure`, returns every offered structure side by side. A missing `downPaymentFils` or
 * `tenureMonths` is the listing default (`limits.defaultDownPaymentFils`, `limits.defaultTenureMonths`),
 * so the apps never compute defaults themselves.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<{
      productLine?: ProductLine;
      assetPriceFils?: number;
      downPaymentFils?: number;
      tenureMonths?: number;
      structure?: FinanceStructure;
    }>(req);
    if (!body.productLine || !LINES.includes(body.productLine)) return problem(400, 'BAD_REQUEST', 'productLine is required');
    if (typeof body.assetPriceFils !== 'number') return problem(400, 'BAD_REQUEST', 'assetPriceFils is required');
    for (const k of ['downPaymentFils', 'tenureMonths'] as const) {
      if (body[k] !== undefined && typeof body[k] !== 'number') return problem(400, 'BAD_REQUEST', `${k} must be a number`);
    }
    const limits = financeLimits(body.productLine, body.assetPriceFils);
    const input = {
      productLine: body.productLine,
      assetPriceFils: body.assetPriceFils,
      downPaymentFils: body.downPaymentFils ?? limits.defaultDownPaymentFils,
      tenureMonths: body.tenureMonths ?? limits.defaultTenureMonths,
    };
    const quotes = body.structure ? [quoteFinance({ ...input, structure: body.structure })] : compareStructures(input);
    return ok({ quotes, limits });
  } catch (e) {
    return handleError(e);
  }
}
