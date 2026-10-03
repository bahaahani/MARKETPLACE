import type { Fils } from './money';
import { bhd } from './money';
import type { Localized } from './types';

/**
 * Motor insurance comparison (Tasheelat Insurance acts as broker).
 * ⚠️ Demo insurers and pricing. Real quotes come from insurer APIs.
 */
export type MotorCover = 'comprehensive' | 'third-party';

export interface Insurer {
  id: string;
  name: Localized;
  takaful: boolean;
  /** Comprehensive premium as a percentage of vehicle value */
  comprehensiveRatePct: number;
  minComprehensiveFils: Fils;
  thirdPartyFils: Fils;
  roadsideAssistance: boolean;
  agencyRepair: boolean;
}

export const DEMO_INSURERS: Insurer[] = [
  { id: 'pearl-takaful', name: { en: 'Pearl Takaful (demo)', ar: 'اللؤلؤ للتكافل (تجريبي)' }, takaful: true, comprehensiveRatePct: 2.6, minComprehensiveFils: bhd(160), thirdPartyFils: bhd(45), roadsideAssistance: true, agencyRepair: true },
  { id: 'dilmun-insurance', name: { en: 'Dilmun Insurance (demo)', ar: 'دلمون للتأمين (تجريبي)' }, takaful: false, comprehensiveRatePct: 2.3, minComprehensiveFils: bhd(150), thirdPartyFils: bhd(40), roadsideAssistance: true, agencyRepair: false },
  { id: 'awal-takaful', name: { en: 'Awal Takaful (demo)', ar: 'أوال للتكافل (تجريبي)' }, takaful: true, comprehensiveRatePct: 2.45, minComprehensiveFils: bhd(155), thirdPartyFils: bhd(42), roadsideAssistance: false, agencyRepair: true },
  { id: 'manama-assurance', name: { en: 'Manama Assurance (demo)', ar: 'المنامة للضمان (تجريبي)' }, takaful: false, comprehensiveRatePct: 2.9, minComprehensiveFils: bhd(170), thirdPartyFils: bhd(38), roadsideAssistance: true, agencyRepair: true },
];

export interface MotorQuoteInput {
  vehicleValueFils: Fils;
  cover: MotorCover;
  /** Only show Takaful operators (default for Islamic finance) */
  takafulOnly?: boolean;
  /** New cars under 3 years usually need agency repair */
  agencyRepair?: boolean;
}

export interface MotorQuote {
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  cover: MotorCover;
  annualPremiumFils: Fils;
  roadsideAssistance: boolean;
  agencyRepair: boolean;
}

export function motorQuotes(input: MotorQuoteInput, insurers: Insurer[] = DEMO_INSURERS): MotorQuote[] {
  return insurers
    .filter((i) => !input.takafulOnly || i.takaful)
    .filter((i) => !input.agencyRepair || input.cover === 'third-party' || i.agencyRepair)
    .map((i) => ({
      insurerId: i.id,
      insurerName: i.name,
      takaful: i.takaful,
      cover: input.cover,
      annualPremiumFils:
        input.cover === 'third-party'
          ? i.thirdPartyFils
          : Math.max(i.minComprehensiveFils, Math.round((input.vehicleValueFils * i.comprehensiveRatePct) / 100)),
      roadsideAssistance: i.roadsideAssistance,
      agencyRepair: input.cover === 'comprehensive' && i.agencyRepair,
    }))
    .sort((a, b) => a.annualPremiumFils - b.annualPremiumFils);
}
