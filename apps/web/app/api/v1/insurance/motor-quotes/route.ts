import { motorQuotes, type MotorCover } from '@sahel/domain';
import { handleError, ok, problem } from '@/lib/api';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { vehicleValueFils?: number; cover?: MotorCover; takafulOnly?: boolean; agencyRepair?: boolean };
    if (typeof body.vehicleValueFils !== 'number' || !Number.isInteger(body.vehicleValueFils) || body.vehicleValueFils <= 0) {
      return problem(400, 'BAD_REQUEST', 'vehicleValueFils must be a positive integer');
    }
    const cover: MotorCover = body.cover === 'third-party' ? 'third-party' : 'comprehensive';
    return ok({ quotes: motorQuotes({ vehicleValueFils: body.vehicleValueFils, cover, takafulOnly: body.takafulOnly, agencyRepair: body.agencyRepair }) });
  } catch (e) {
    return handleError(e);
  }
}
