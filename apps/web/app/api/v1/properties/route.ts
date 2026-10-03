import { PROPERTIES, searchProperties, type PropertyPurpose, type PropertyType } from '@sahel/domain';
import { handleError, intParam, ok } from '@/lib/api';

export function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const items = searchProperties(PROPERTIES, {
      purpose: (p.get('purpose') as PropertyPurpose) || undefined,
      type: (p.get('type') as PropertyType) || undefined,
      minBedrooms: intParam(p.get('minBedrooms')),
      maxPriceFils: intParam(p.get('maxPriceFils')),
      q: p.get('q') ?? undefined,
    });
    return ok({ items, total: items.length });
  } catch (e) {
    return handleError(e);
  }
}
