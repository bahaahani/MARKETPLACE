import type { Fils } from './money';
import { bhd } from './money';
import type { Localized } from './types';
import type { Policy } from './policies';
import type { MotorCover } from './insurance';
import { bahrainToday, daysBetweenIso, isIsoDate } from './insurance-common';

/**
 * Motor claims: First Notice of Loss (J6), ⚠️ SANDBOX.
 *
 * A claim is filed by the session customer against one of their own ACTIVE motor policies (from the policy store).
 * Status machine (enforced): SUBMITTED → UNDER_ASSESSMENT → APPROVED | REJECTED; APPROVED → REPAIR_BOOKED (a garage
 * is chosen) → SETTLED. A total loss (theft, or damage worth the whole car) has nothing to repair, so it goes
 * APPROVED → SETTLED directly.
 *
 * ⚠️ Placeholders, not production:
 * - The "damage estimate" is a fixed rules table by claim type and severity. It is NOT an AI model and looks at no photo.
 * - Photos: validated (count, size, JPEG / PNG / WebP by magic bytes) and then DISCARDED. Only metadata (type and size)
 *   is kept, because the sandbox has no secure file storage: no customer images (faces, plates, places) sit in server
 *   memory, memory use per claim stays tiny, and the API never serves user-uploaded content back.
 * - Garages are a demo list; the replacement car from Tasheelat Car Leasing is an information card (no booking).
 * - Assessment is driven by a sandbox "advance" call that stands in for the insurer's claims handler.
 * Production: the claim is lodged with the insurer through Tasheelat Insurance (broker), photos go to encrypted
 * document storage, and the insurer's assessor decides.
 */

export const CLAIM_TYPES = ['collision', 'theft', 'glass', 'fire', 'other'] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_SEVERITIES = ['minor', 'moderate', 'severe'] as const;
export type ClaimSeverity = (typeof CLAIM_SEVERITIES)[number];

export const CLAIM_STATUSES = ['SUBMITTED', 'UNDER_ASSESSMENT', 'APPROVED', 'REJECTED', 'REPAIR_BOOKED', 'SETTLED'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Allowed transitions. APPROVED → SETTLED only for a total loss (nothing to repair); see canTransition. */
export const CLAIM_TRANSITIONS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  SUBMITTED: ['UNDER_ASSESSMENT'],
  UNDER_ASSESSMENT: ['APPROVED', 'REJECTED'],
  APPROVED: ['REPAIR_BOOKED', 'SETTLED'],
  REJECTED: [],
  REPAIR_BOOKED: ['SETTLED'],
  SETTLED: [],
};

// ---- Form rules (also served to the apps by GET /config) ---------------------------------------------------------

/** ⚠️ VERIFY (Insurance): most photos per claim. */
export const CLAIM_MAX_PHOTOS = 6;
/** ⚠️ VERIFY: largest photo accepted, after the app has compressed it. */
export const CLAIM_MAX_PHOTO_BYTES = 400_000;
/** The apps resize photos so the longer side is at most this, before upload. */
export const CLAIM_PHOTO_MAX_DIMENSION_PX = 1600;
export const CLAIM_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ClaimPhotoMimeType = (typeof CLAIM_PHOTO_MIME_TYPES)[number];
/** At least one photo of the damage, except for theft (there is nothing to photograph). */
export const CLAIM_MIN_PHOTOS: Readonly<Record<ClaimType, number>> = { collision: 1, theft: 0, glass: 1, fire: 1, other: 1 };
export const CLAIM_DESCRIPTION_MIN_LENGTH = 10;
export const CLAIM_DESCRIPTION_MAX_LENGTH = 1000;
export const CLAIM_LOCATION_MIN_LENGTH = 3;
export const CLAIM_LOCATION_MAX_LENGTH = 200;
export const CLAIM_POLICE_REPORT_MAX_LENGTH = 30;
/** ⚠️ VERIFY (Insurance, Traffic Directorate): a police report number is mandatory for these types. */
export const CLAIM_POLICE_REPORT_REQUIRED_FOR: readonly ClaimType[] = ['theft'];
/** ⚠️ VERIFY: how long after the incident a claim can still be notified. */
export const CLAIM_MAX_DAYS_SINCE_INCIDENT = 30;
/** Third-party-only cover pays for damage to someone else, so only these types, with a third party involved. */
export const CLAIM_THIRD_PARTY_COVER_TYPES: readonly ClaimType[] = ['collision', 'other'];
/** Sandbox memory cap. */
export const CLAIM_MAX_PER_CUSTOMER = 20;
/** Largest POST /claims body: every photo at the cap, base64-encoded, plus the form fields. */
export const CLAIM_MAX_BODY_BYTES = CLAIM_MAX_PHOTOS * Math.ceil((CLAIM_MAX_PHOTO_BYTES * 4) / 3) + 32_000;

/** Clock skew tolerated before an incident time counts as "in the future". */
const FUTURE_SKEW_MS = 60_000;

export interface ClaimRules {
  types: ClaimType[];
  severities: ClaimSeverity[];
  minPhotos: Record<ClaimType, number>;
  maxPhotos: number;
  maxPhotoBytes: number;
  photoMaxDimensionPx: number;
  photoMimeTypes: string[];
  descriptionMinLength: number;
  descriptionMaxLength: number;
  locationMinLength: number;
  locationMaxLength: number;
  policeReportMaxLength: number;
  policeReportRequiredFor: ClaimType[];
  maxDaysSinceIncident: number;
  thirdPartyCoverTypes: ClaimType[];
}

export function claimRules(): ClaimRules {
  return {
    types: [...CLAIM_TYPES],
    severities: [...CLAIM_SEVERITIES],
    minPhotos: { ...CLAIM_MIN_PHOTOS },
    maxPhotos: CLAIM_MAX_PHOTOS,
    maxPhotoBytes: CLAIM_MAX_PHOTO_BYTES,
    photoMaxDimensionPx: CLAIM_PHOTO_MAX_DIMENSION_PX,
    photoMimeTypes: [...CLAIM_PHOTO_MIME_TYPES],
    descriptionMinLength: CLAIM_DESCRIPTION_MIN_LENGTH,
    descriptionMaxLength: CLAIM_DESCRIPTION_MAX_LENGTH,
    locationMinLength: CLAIM_LOCATION_MIN_LENGTH,
    locationMaxLength: CLAIM_LOCATION_MAX_LENGTH,
    policeReportMaxLength: CLAIM_POLICE_REPORT_MAX_LENGTH,
    policeReportRequiredFor: [...CLAIM_POLICE_REPORT_REQUIRED_FOR],
    maxDaysSinceIncident: CLAIM_MAX_DAYS_SINCE_INCIDENT,
    thirdPartyCoverTypes: [...CLAIM_THIRD_PARTY_COVER_TYPES],
  };
}

// ---- Errors ----------------------------------------------------------------------------------------------------

export type ClaimErrorCode =
  | 'INVALID_REQUEST'
  | 'POLICY_NOT_FOUND'
  | 'NOT_MOTOR_POLICY'
  | 'POLICY_NOT_ACTIVE'
  | 'NOT_COVERED'
  | 'INVALID_INCIDENT_TIME'
  | 'INCIDENT_IN_FUTURE'
  | 'INCIDENT_OUTSIDE_POLICY'
  | 'INCIDENT_TOO_OLD'
  | 'INVALID_LOCATION'
  | 'INVALID_DESCRIPTION'
  | 'POLICE_REPORT_REQUIRED'
  | 'INVALID_POLICE_REPORT'
  | 'PHOTOS_REQUIRED'
  | 'TOO_MANY_PHOTOS'
  | 'PHOTO_TOO_LARGE'
  | 'PHOTO_INVALID'
  | 'CLAIM_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'GARAGE_NOT_FOUND'
  | 'GARAGE_NOT_ALLOWED'
  | 'NO_REPAIR_NEEDED'
  | 'TOO_MANY_CLAIMS';

/** Suggested HTTP status for each claim error. */
export const CLAIM_ERROR_STATUS: Record<ClaimErrorCode, number> = {
  INVALID_REQUEST: 422,
  POLICY_NOT_FOUND: 404,
  NOT_MOTOR_POLICY: 422,
  POLICY_NOT_ACTIVE: 422,
  NOT_COVERED: 422,
  INVALID_INCIDENT_TIME: 422,
  INCIDENT_IN_FUTURE: 422,
  INCIDENT_OUTSIDE_POLICY: 422,
  INCIDENT_TOO_OLD: 422,
  INVALID_LOCATION: 422,
  INVALID_DESCRIPTION: 422,
  POLICE_REPORT_REQUIRED: 422,
  INVALID_POLICE_REPORT: 422,
  PHOTOS_REQUIRED: 422,
  TOO_MANY_PHOTOS: 422,
  PHOTO_TOO_LARGE: 413,
  PHOTO_INVALID: 422,
  CLAIM_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  GARAGE_NOT_FOUND: 422,
  GARAGE_NOT_ALLOWED: 422,
  NO_REPAIR_NEEDED: 409,
  TOO_MANY_CLAIMS: 429,
};

export class ClaimError extends Error {
  constructor(
    public readonly code: ClaimErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClaimError';
  }
}

// ---- Photos ----------------------------------------------------------------------------------------------------

export interface ClaimPhotoInput {
  /** Optional; when given it must match the bytes (image/jpg is read as image/jpeg) */
  mimeType?: string;
  /** Base64 image bytes, or a data: URL */
  dataBase64: string;
}

/** What is kept of a photo: its type and size. The bytes are discarded after validation (⚠️ sandbox). */
export interface ClaimPhoto {
  index: number;
  mimeType: ClaimPhotoMimeType;
  bytes: number;
}

/** Image type from the first bytes (magic numbers): JPEG, PNG or WebP; anything else is undefined. */
export function sniffImageType(head: Uint8Array): ClaimPhotoMimeType | undefined {
  const b = (i: number) => head[i];
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const DATA_URL = /^data:([\w.+/-]+);base64,/;

/** Decoded size of a base64 string (without decoding it). */
function base64Bytes(s: string): number {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return (s.length / 4) * 3 - pad;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode validated base64 (no runtime dependency on atob / Buffer, so it runs anywhere). */
function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    value = (value << 6) | B64_ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

/** Validate one photo and return its metadata. Throws PHOTO_INVALID or PHOTO_TOO_LARGE. */
export function validateClaimPhoto(input: unknown, index: number): ClaimPhoto {
  const bad = (why: string) => new ClaimError('PHOTO_INVALID', `photo ${index + 1}: ${why}`);
  if (typeof input !== 'object' || input === null) throw bad('must be an object with dataBase64');
  const { mimeType, dataBase64 } = input as Partial<ClaimPhotoInput>;
  if (typeof dataBase64 !== 'string' || !dataBase64) throw bad('dataBase64 is required');
  let declared = mimeType;
  let data = dataBase64;
  const url = DATA_URL.exec(data);
  if (url) {
    declared ??= url[1];
    data = data.slice(url[0].length);
  }
  if (declared !== undefined && typeof declared !== 'string') throw bad('mimeType must be a string');
  // Cheap checks first: the size is known from the length, so an oversized photo is never decoded.
  if (data.length % 4 !== 0 || !BASE64.test(data)) throw bad('dataBase64 is not valid base64');
  const bytes = base64Bytes(data);
  if (bytes > CLAIM_MAX_PHOTO_BYTES) {
    throw new ClaimError('PHOTO_TOO_LARGE', `photo ${index + 1} is ${bytes} bytes; the limit is ${CLAIM_MAX_PHOTO_BYTES}`);
  }
  if (bytes < 16) throw bad('too small to be an image');
  // The type comes from the bytes, never from the client's label.
  const detected = sniffImageType(decodeBase64(data.slice(0, 16)));
  if (!detected) throw bad('only JPEG, PNG or WebP images are accepted');
  if (declared !== undefined) {
    const normalized = declared.toLowerCase() === 'image/jpg' ? 'image/jpeg' : declared.toLowerCase();
    if (normalized !== detected) throw bad(`declared ${declared} but the file is ${detected}`);
  }
  return { index, mimeType: detected, bytes };
}

// ---- Estimate, garages, replacement car ------------------------------------------------------------------------

/**
 * ⚠️ SANDBOX PLACEHOLDER, NOT AI: a fixed table by claim type and severity (BHD), capped at the insured vehicle value.
 * Production: the insurer's assessor (or a vetted damage-assessment service) estimates from the photos.
 */
export const DAMAGE_ESTIMATE_TABLE: Readonly<Record<ClaimType, Record<ClaimSeverity, Fils | 'TOTAL_LOSS'>>> = {
  collision: { minor: bhd(150), moderate: bhd(600), severe: bhd(2_500) },
  theft: { minor: 'TOTAL_LOSS', moderate: 'TOTAL_LOSS', severe: 'TOTAL_LOSS' },
  glass: { minor: bhd(60), moderate: bhd(120), severe: bhd(250) },
  fire: { minor: bhd(300), moderate: bhd(1_500), severe: 'TOTAL_LOSS' },
  other: { minor: bhd(100), moderate: bhd(400), severe: bhd(1_200) },
};

/** ⚠️ Placeholder working days in the garage, by type and severity. */
const REPAIR_DAYS: Readonly<Record<ClaimType, Record<ClaimSeverity, number>>> = {
  collision: { minor: 2, moderate: 5, severe: 10 },
  theft: { minor: 0, moderate: 0, severe: 0 },
  glass: { minor: 1, moderate: 1, severe: 2 },
  fire: { minor: 4, moderate: 8, severe: 0 },
  other: { minor: 2, moderate: 4, severe: 7 },
};

export interface DamageEstimate {
  /** Always the sandbox rules table; never an AI model */
  method: 'SANDBOX_RULES';
  ai: false;
  estimateFils: Fils;
  /** Range shown to the customer: -20% / +20%, capped at the vehicle value */
  lowFils: Fils;
  highFils: Fils;
  /** Theft, or damage worth the whole car: settled at the vehicle value, nothing to repair */
  totalLoss: boolean;
  repairDays: number;
}

export function estimateDamage(type: ClaimType, severity: ClaimSeverity, vehicleValueFils: Fils): DamageEstimate {
  const row = DAMAGE_ESTIMATE_TABLE[type][severity];
  const totalLoss = row === 'TOTAL_LOSS' || row >= vehicleValueFils;
  if (totalLoss) {
    return { method: 'SANDBOX_RULES', ai: false, estimateFils: vehicleValueFils, lowFils: vehicleValueFils, highFils: vehicleValueFils, totalLoss, repairDays: 0 };
  }
  return {
    method: 'SANDBOX_RULES',
    ai: false,
    estimateFils: row,
    lowFils: Math.floor((row * 4) / 5),
    highFils: Math.min(vehicleValueFils, Math.floor((row * 6) / 5)),
    totalLoss,
    repairDays: REPAIR_DAYS[type][severity],
  };
}

export interface Garage {
  id: string;
  name: Localized;
  area: Localized;
  /** Agency (dealer) workshop: only for policies with agency repair */
  agency: boolean;
}

/** ⚠️ Demo garages (fictional). Production: the insurer's approved garage network. */
export const DEMO_GARAGES: readonly Garage[] = [
  { id: 'g-sitra-auto-works', name: { en: 'Sitra Auto Works (demo)', ar: 'ورشة سترة للسيارات (تجريبي)' }, area: { en: 'Sitra', ar: 'سترة' }, agency: false },
  { id: 'g-tubli-body-paint', name: { en: 'Tubli Body & Paint (demo)', ar: 'توبلي للسمكرة والصبغ (تجريبي)' }, area: { en: 'Tubli', ar: 'توبلي' }, agency: false },
  { id: 'g-salmabad-motor-care', name: { en: 'Salmabad Motor Care (demo)', ar: 'سلماباد لصيانة السيارات (تجريبي)' }, area: { en: 'Salmabad', ar: 'سلماباد' }, agency: false },
  { id: 'g-agency-sitra', name: { en: 'Agency service centre, Sitra (demo)', ar: 'مركز خدمة الوكالة، سترة (تجريبي)' }, area: { en: 'Sitra', ar: 'سترة' }, agency: true },
  { id: 'g-agency-isa-town', name: { en: 'Agency service centre, Isa Town (demo)', ar: 'مركز خدمة الوكالة، مدينة عيسى (تجريبي)' }, area: { en: 'Isa Town', ar: 'مدينة عيسى' }, agency: true },
];

/** Garages a claim may book: agency workshops only when the policy includes agency repair. */
export function garageOptions(agencyRepair: boolean): Garage[] {
  return DEMO_GARAGES.filter((g) => agencyRepair || !g.agency);
}

/** Replacement car while the car is off the road: an information card only (no booking). */
export interface ReplacementCarOffer {
  offered: boolean;
  provider: Localized;
  vehicleClass: Localized;
  /** ⚠️ Placeholder: repair days, or 14 days for a total loss; at most 14 */
  days: number;
}

const REPLACEMENT_PROVIDER: Localized = { en: 'Tasheelat Car Leasing', ar: 'تسهيلات لتأجير السيارات' };
const REPLACEMENT_MAX_DAYS = 14;

export function replacementCarOffer(claim: Pick<Claim, 'status' | 'estimate' | 'cover'>): ReplacementCarOffer {
  const days = Math.min(REPLACEMENT_MAX_DAYS, claim.estimate.totalLoss ? REPLACEMENT_MAX_DAYS : claim.estimate.repairDays);
  // Comprehensive cover only, and not for a quick fix or a rejected claim.
  const offered = claim.cover === 'comprehensive' && days >= 2 && claim.status !== 'REJECTED';
  return { offered, provider: REPLACEMENT_PROVIDER, vehicleClass: { en: 'Compact sedan or similar', ar: 'سيدان صغيرة أو ما يماثلها' }, days: offered ? days : 0 };
}

// ---- Claims ----------------------------------------------------------------------------------------------------

export interface ClaimInput {
  policyId: string;
  /** ISO date-time. With an offset or Z it is an instant; without one it is Bahrain local time (Asia/Bahrain) */
  incidentAt: string;
  location: string;
  latitude?: number;
  longitude?: number;
  type: ClaimType;
  severity: ClaimSeverity;
  description: string;
  policeReportNumber?: string;
  thirdPartyInvolved: boolean;
  photos?: ClaimPhotoInput[];
}

export interface ClaimHistoryEntry {
  status: ClaimStatus;
  at: string;
}

export interface Claim {
  id: string;
  /** SBX-CLM-YY-NNNNNN (sandbox) */
  claimNumber: string;
  customerId: string;
  policyId: string;
  policyNumber: string;
  insurerName: Localized;
  cover: MotorCover;
  agencyRepair: boolean;
  /** Plate (the motor policy's reference) */
  vehicleReference: string;
  vehicleValueFils: Fils;
  /** ISO instant (UTC) */
  incidentAt: string;
  /** Bahrain calendar date of the incident */
  incidentDate: string;
  location: string;
  latitude?: number;
  longitude?: number;
  type: ClaimType;
  severity: ClaimSeverity;
  description: string;
  policeReportNumber?: string;
  thirdPartyInvolved: boolean;
  photos: ClaimPhoto[];
  estimate: DamageEstimate;
  status: ClaimStatus;
  history: ClaimHistoryEntry[];
  /** Set on approval (⚠️ sandbox: the estimate) */
  approvedAmountFils?: Fils;
  garage?: { garageId: string; name: Localized; area: Localized; agency: boolean; bookedAt: string };
  createdAt: string;
  updatedAt: string;
}

/** API representation (GET /claims/{id}): the claim plus what the customer can do next. */
export interface ClaimView extends Claim {
  /** Garages this claim can book (empty unless it is APPROVED and needs a repair) */
  garageOptions: Garage[];
  canBookGarage: boolean;
  replacementCar: ReplacementCarOffer;
  /** Statuses the sandbox "advance" call may move it to */
  nextStatuses: ClaimStatus[];
  /** The path for the status timeline: steps reached (with their time) and the ones still expected */
  progress: ClaimProgressStep[];
}

export interface ClaimProgressStep {
  status: ClaimStatus;
  done: boolean;
  /** When the step was reached */
  at?: string;
  /** The claim's current step */
  current: boolean;
}

/** Timeline steps: the history so far, then the statuses still expected on this claim's path. */
export function claimProgress(claim: Pick<Claim, 'status' | 'history' | 'estimate'>): ClaimProgressStep[] {
  const path: ClaimStatus[] =
    claim.status === 'REJECTED'
      ? ['SUBMITTED', 'UNDER_ASSESSMENT', 'REJECTED']
      : ['SUBMITTED', 'UNDER_ASSESSMENT', 'APPROVED', ...(needsRepair(claim) ? (['REPAIR_BOOKED'] as const) : []), 'SETTLED'];
  return path.map((status) => {
    const reached = claim.history.find((h) => h.status === status);
    return { status, done: reached !== undefined, ...(reached ? { at: reached.at } : {}), current: claim.status === status };
  });
}

/** Total loss claims have nothing to repair. */
export function needsRepair(claim: Pick<Claim, 'estimate'>): boolean {
  return !claim.estimate.totalLoss;
}

export function canTransition(claim: Pick<Claim, 'status' | 'estimate'>, to: ClaimStatus): boolean {
  if (!CLAIM_TRANSITIONS[claim.status].includes(to)) return false;
  if (claim.status === 'APPROVED') return to === 'SETTLED' ? !needsRepair(claim) : needsRepair(claim);
  return true;
}

export function claimView(claim: Claim): ClaimView {
  const canBookGarage = claim.status === 'APPROVED' && needsRepair(claim);
  return {
    ...claim,
    garageOptions: canBookGarage ? garageOptions(claim.agencyRepair) : [],
    canBookGarage,
    replacementCar: replacementCarOffer(claim),
    // REPAIR_BOOKED needs a garage (POST /claims/{id}/garage), so "advance" never goes there.
    nextStatuses: CLAIM_TRANSITIONS[claim.status].filter((s) => s !== 'REPAIR_BOOKED' && canTransition(claim, s)),
    progress: claimProgress(claim),
  };
}

const BAHRAIN_OFFSET = '+03:00';
const INCIDENT_AT = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

/** Parse an incident time; without an offset it is Bahrain local time. Returns epoch ms or throws. */
export function parseIncidentAt(raw: unknown): number {
  const m = typeof raw === 'string' ? INCIDENT_AT.exec(raw) : null;
  if (!m || !isIsoDate(m[1])) throw new ClaimError('INVALID_INCIDENT_TIME', 'incidentAt must be an ISO date-time, e.g. 2026-10-03T14:30');
  const t = Date.parse(m[5] ? raw as string : `${raw as string}${BAHRAIN_OFFSET}`);
  if (Number.isNaN(t)) throw new ClaimError('INVALID_INCIDENT_TIME', 'incidentAt is not a valid time');
  return t;
}

const POLICE_REPORT = /^[A-Za-z0-9][A-Za-z0-9/-]*$/;

function trimmedText(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

/**
 * Validate a claim for one of the customer's policies. `policies` are THIS customer's policies (another customer's
 * policy id is POLICY_NOT_FOUND). Returns the claim fields without ids and status.
 */
export function validateClaim(
  input: unknown,
  policies: readonly Policy[],
  now: Date = new Date(),
): Omit<Claim, 'id' | 'claimNumber' | 'customerId' | 'status' | 'history' | 'createdAt' | 'updatedAt'> {
  if (typeof input !== 'object' || input === null) throw new ClaimError('INVALID_REQUEST', 'body must be an object');
  const i = input as Partial<Record<keyof ClaimInput, unknown>>;

  if (typeof i.policyId !== 'string' || !i.policyId) throw new ClaimError('INVALID_REQUEST', 'policyId is required');
  const policy = policies.find((p) => p.id === i.policyId);
  if (!policy) throw new ClaimError('POLICY_NOT_FOUND', 'no such policy for this customer');
  if (policy.cover.line !== 'motor') throw new ClaimError('NOT_MOTOR_POLICY', `policy ${policy.policyNumber} is not motor cover`);
  if (policy.status !== 'ACTIVE') throw new ClaimError('POLICY_NOT_ACTIVE', `policy ${policy.policyNumber} is ${policy.status}`);
  const cover = policy.cover;

  if (!CLAIM_TYPES.includes(i.type as ClaimType)) throw new ClaimError('INVALID_REQUEST', `type must be one of ${CLAIM_TYPES.join(', ')}`);
  if (!CLAIM_SEVERITIES.includes(i.severity as ClaimSeverity)) {
    throw new ClaimError('INVALID_REQUEST', `severity must be one of ${CLAIM_SEVERITIES.join(', ')}`);
  }
  const type = i.type as ClaimType;
  const severity = i.severity as ClaimSeverity;
  if (typeof i.thirdPartyInvolved !== 'boolean') throw new ClaimError('INVALID_REQUEST', 'thirdPartyInvolved must be true or false');
  if (cover.cover === 'third-party' && (!CLAIM_THIRD_PARTY_COVER_TYPES.includes(type) || !i.thirdPartyInvolved)) {
    throw new ClaimError('NOT_COVERED', 'third-party cover pays only for damage to a third party (collision or other, third party involved)');
  }

  // When: not in the future, inside the policy period (Bahrain dates, and not before the policy was bought).
  const t = parseIncidentAt(i.incidentAt);
  if (t > now.getTime() + FUTURE_SKEW_MS) throw new ClaimError('INCIDENT_IN_FUTURE', 'the incident cannot be in the future');
  const incident = new Date(t);
  const incidentDate = bahrainToday(incident);
  const coverFrom = Math.max(Date.parse(`${policy.startDate}T00:00:00${BAHRAIN_OFFSET}`), Math.floor(Date.parse(policy.issuedAt) / 60_000) * 60_000);
  if (incidentDate > policy.endDate || t < coverFrom) {
    throw new ClaimError('INCIDENT_OUTSIDE_POLICY', `the incident must be between the policy start and ${policy.endDate}`);
  }
  if (daysBetweenIso(incidentDate, bahrainToday(now)) > CLAIM_MAX_DAYS_SINCE_INCIDENT) {
    throw new ClaimError('INCIDENT_TOO_OLD', `claims must be notified within ${CLAIM_MAX_DAYS_SINCE_INCIDENT} days`);
  }

  // Where
  const location = trimmedText(i.location);
  if (!location || location.length < CLAIM_LOCATION_MIN_LENGTH || location.length > CLAIM_LOCATION_MAX_LENGTH) {
    throw new ClaimError('INVALID_LOCATION', `location must be ${CLAIM_LOCATION_MIN_LENGTH} to ${CLAIM_LOCATION_MAX_LENGTH} characters`);
  }
  const hasLat = i.latitude !== undefined && i.latitude !== null;
  const hasLng = i.longitude !== undefined && i.longitude !== null;
  if (hasLat !== hasLng) throw new ClaimError('INVALID_LOCATION', 'send both latitude and longitude, or neither');
  if (hasLat) {
    const ok = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
    if (!ok(i.latitude, 90) || !ok(i.longitude, 180)) throw new ClaimError('INVALID_LOCATION', 'latitude / longitude out of range');
  }

  // What
  const description = trimmedText(i.description);
  if (!description || description.length < CLAIM_DESCRIPTION_MIN_LENGTH || description.length > CLAIM_DESCRIPTION_MAX_LENGTH) {
    throw new ClaimError('INVALID_DESCRIPTION', `description must be ${CLAIM_DESCRIPTION_MIN_LENGTH} to ${CLAIM_DESCRIPTION_MAX_LENGTH} characters`);
  }
  if (i.policeReportNumber !== undefined && i.policeReportNumber !== null && typeof i.policeReportNumber !== 'string') {
    throw new ClaimError('INVALID_POLICE_REPORT', 'policeReportNumber must be a string');
  }
  const policeReportNumber = trimmedText(i.policeReportNumber) || undefined;
  if (policeReportNumber && (policeReportNumber.length < 3 || policeReportNumber.length > CLAIM_POLICE_REPORT_MAX_LENGTH || !POLICE_REPORT.test(policeReportNumber))) {
    throw new ClaimError('INVALID_POLICE_REPORT', `police report number: 3 to ${CLAIM_POLICE_REPORT_MAX_LENGTH} letters, digits, / or -`);
  }
  if (!policeReportNumber && CLAIM_POLICE_REPORT_REQUIRED_FOR.includes(type)) {
    throw new ClaimError('POLICE_REPORT_REQUIRED', `a police report number is required for ${type}`);
  }

  // Photos
  const rawPhotos = i.photos ?? [];
  if (!Array.isArray(rawPhotos)) throw new ClaimError('INVALID_REQUEST', 'photos must be an array');
  if (rawPhotos.length > CLAIM_MAX_PHOTOS) throw new ClaimError('TOO_MANY_PHOTOS', `at most ${CLAIM_MAX_PHOTOS} photos`);
  if (rawPhotos.length < CLAIM_MIN_PHOTOS[type]) throw new ClaimError('PHOTOS_REQUIRED', `add at least ${CLAIM_MIN_PHOTOS[type]} photo of the damage`);
  const photos = rawPhotos.map((p, idx) => validateClaimPhoto(p, idx));

  return {
    policyId: policy.id,
    policyNumber: policy.policyNumber,
    insurerName: policy.insurerName,
    cover: cover.cover,
    agencyRepair: cover.agencyRepair,
    vehicleReference: cover.reference,
    vehicleValueFils: cover.vehicleValueFils,
    incidentAt: incident.toISOString(),
    incidentDate,
    location,
    ...(hasLat ? { latitude: round5(i.latitude as number), longitude: round5(i.longitude as number) } : {}),
    type,
    severity,
    description,
    ...(policeReportNumber ? { policeReportNumber } : {}),
    thirdPartyInvolved: i.thirdPartyInvolved,
    photos,
    estimate: estimateDamage(type, severity, cover.vehicleValueFils),
  };
}

/** About 1 m: enough for a claim, no false precision. */
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * In-memory sandbox claims (like SandboxPolicyStore). Every claim belongs to one customer: another customer's id
 * reads as not found. Production: the broker's claims platform and the insurer's claims API.
 */
export class SandboxClaimStore {
  private readonly claims = new Map<string, Claim>();
  private readonly idempotency = new Map<string, string>();
  private seq = 0;
  private filed = 0;

  /**
   * @param policiesOf the customer's current policies (with status), e.g. policyStore.list
   */
  constructor(
    private readonly policiesOf: (customerId: string) => Policy[],
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** File a claim (status SUBMITTED). A repeated idempotency key returns the original claim. */
  file(customerId: string, input: unknown, idempotencyKey?: string): Claim {
    const key = idempotencyKey ? `${customerId}\u0000${idempotencyKey}` : undefined;
    const seen = key && this.idempotency.get(key);
    if (seen) return this.claims.get(seen)!;
    const now = this.clock();
    const fields = validateClaim(input, this.policiesOf(customerId), now);
    if (this.list(customerId).length >= CLAIM_MAX_PER_CUSTOMER) {
      throw new ClaimError('TOO_MANY_CLAIMS', `sandbox limit of ${CLAIM_MAX_PER_CUSTOMER} claims per customer`);
    }
    const at = now.toISOString();
    const claim: Claim = {
      id: `clm_sbx_${now.getTime().toString(36)}_${(++this.seq).toString(36)}`,
      claimNumber: `SBX-CLM-${bahrainToday(now).slice(2, 4)}-${String(++this.filed).padStart(6, '0')}`,
      customerId,
      ...fields,
      status: 'SUBMITTED',
      history: [{ status: 'SUBMITTED', at }],
      createdAt: at,
      updatedAt: at,
    };
    this.claims.set(claim.id, claim);
    if (key) this.idempotency.set(key, claim.id);
    return claim;
  }

  /** With another customer's id this is undefined, like an unknown claim. */
  get(id: string, customerId: string): Claim | undefined {
    const c = this.claims.get(id);
    return c && c.customerId === customerId ? c : undefined;
  }

  /** Newest first. */
  list(customerId: string): Claim[] {
    return [...this.claims.values()].filter((c) => c.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  /** Choose a garage for an approved claim that needs a repair: APPROVED → REPAIR_BOOKED. */
  bookGarage(id: string, customerId: string, garageId: unknown): Claim {
    const claim = this.require(id, customerId);
    if (typeof garageId !== 'string' || !garageId) throw new ClaimError('INVALID_REQUEST', 'garageId is required');
    if (!needsRepair(claim)) throw new ClaimError('NO_REPAIR_NEEDED', 'a total loss is settled without a repair');
    if (!canTransition(claim, 'REPAIR_BOOKED')) {
      throw new ClaimError('INVALID_TRANSITION', `a garage can be booked only for an APPROVED claim (this one is ${claim.status})`);
    }
    const garage = DEMO_GARAGES.find((g) => g.id === garageId);
    if (!garage) throw new ClaimError('GARAGE_NOT_FOUND', `unknown garage ${garageId}`);
    if (garage.agency && !claim.agencyRepair) throw new ClaimError('GARAGE_NOT_ALLOWED', 'agency garages need a policy with agency repair');
    const at = this.clock().toISOString();
    return this.save({
      ...claim,
      status: 'REPAIR_BOOKED',
      garage: { garageId: garage.id, name: garage.name, area: garage.area, agency: garage.agency, bookedAt: at },
      history: [...claim.history, { status: 'REPAIR_BOOKED', at }],
      updatedAt: at,
    });
  }

  /**
   * ⚠️ SANDBOX ONLY: stands in for the insurer's claims handler. Moves the claim to `to`, or by default to the next
   * happy-path status (UNDER_ASSESSMENT, then APPROVED, then SETTLED when nothing needs repairing or after the repair).
   */
  advance(id: string, customerId: string, to?: unknown): Claim {
    const claim = this.require(id, customerId);
    if (to !== undefined && to !== null && !CLAIM_STATUSES.includes(to as ClaimStatus)) {
      throw new ClaimError('INVALID_REQUEST', `to must be one of ${CLAIM_STATUSES.join(', ')}`);
    }
    const next = (to as ClaimStatus | undefined) ?? claimView(claim).nextStatuses[0];
    if (!next || next === 'REPAIR_BOOKED' || !canTransition(claim, next)) {
      const why = claim.status === 'APPROVED' && needsRepair(claim) ? ' (book a garage first)' : '';
      throw new ClaimError('INVALID_TRANSITION', `cannot move a ${claim.status} claim to ${next ?? 'a next status'}${why}`);
    }
    const at = this.clock().toISOString();
    return this.save({
      ...claim,
      status: next,
      ...(next === 'APPROVED' ? { approvedAmountFils: claim.estimate.estimateFils } : {}),
      history: [...claim.history, { status: next, at }],
      updatedAt: at,
    });
  }

  private require(id: string, customerId: string): Claim {
    const c = this.get(id, customerId);
    if (!c) throw new ClaimError('CLAIM_NOT_FOUND', 'claim not found');
    return c;
  }

  private save(c: Claim): Claim {
    this.claims.set(c.id, c);
    return c;
  }
}
