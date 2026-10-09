import type { BidExtra } from './bids';
import type { Fils } from './money';
import { SELLERS, VEHICLES, findVehicle } from './catalog';
import type { CustomerOverview } from './account';
import { quoteFinance, type FinanceQuote } from './pricing';
import { RATE_CARDS } from './rates';
import { vehicleFromMonthly, type VehicleListing } from './search';
import type { FinanceStructure, Localized, Seller } from './types';

/**
 * Dealer & broker portal (B2B, idea #14) and the showroom side of the always-on pre-approval (idea #3, journey J7).
 * ⚠️ Sandbox: no real staff login, leads and tokens live in memory, offers are not sent to the customer's app.
 */

export class DealerError extends Error {
  constructor(
    public readonly code:
      | 'UNKNOWN_DEALER'
      | 'FORBIDDEN'
      | 'LEAD_NOT_FOUND'
      | 'INVALID_TRANSITION'
      | 'VEHICLE_NOT_FOUND'
      | 'VEHICLE_NOT_IN_INVENTORY'
      | 'TOKEN_NOT_FOUND'
      | 'TOKEN_EXPIRED'
      | 'NO_PREAPPROVAL',
    message: string,
  ) {
    super(message);
    this.name = 'DealerError';
  }
}

// ---------------------------------------------------------------------------------------------
// Session

/** Sellers that can use the vehicle dealer portal today. */
export const DEALER_SELLERS: Seller[] = [SELLERS.nmc, SELLERS.tac, SELLERS.partnerDealer];

export function findDealer(sellerId: string): Seller | undefined {
  return DEALER_SELLERS.find((s) => s.id === sellerId);
}

export interface DealerSession {
  sellerId: string;
  seller: Seller;
  staffName: string;
  role: 'sales' | 'manager';
  /** True while there is no real login; the UI shows a ⚠️ sandbox notice. */
  sandbox: boolean;
}

export interface DealerCredentials {
  sellerId: string;
  /** Bearer token from partner SSO. Ignored in the sandbox. */
  bearer?: string | null;
}

/**
 * How a request becomes a dealer session. Production: verify the partner-SSO token and read the seller
 * and role from its claims. Every dealer endpoint goes through this, so swapping it in is one change.
 */
export interface DealerAuthProvider {
  authenticate(credentials: DealerCredentials): DealerSession;
}

/** ⚠️ Sandbox sign-in: anyone can act as any partner dealer. */
export class SandboxDealerAuth implements DealerAuthProvider {
  authenticate({ sellerId }: DealerCredentials): DealerSession {
    const seller = findDealer(sellerId);
    if (!seller) throw new DealerError('UNKNOWN_DEALER', `dealer ${sellerId} not found`);
    return { sellerId: seller.id, seller, staffName: 'Demo Sales', role: 'manager', sandbox: true };
  }
}

/** A session may only touch its own dealership's data. */
export function assertDealerAccess(session: DealerSession, sellerId: string): void {
  if (session.sellerId !== sellerId) throw new DealerError('FORBIDDEN', `session cannot access dealer ${sellerId}`);
}

// ---------------------------------------------------------------------------------------------
// Inventory

export interface DealerInventoryItem extends VehicleListing {
  /** "From" monthly with the Islamic structure (Murabaha), next to the conventional `fromMonthlyFils` */
  fromMonthlyMurabahaFils: Fils;
}

export interface InventoryStats {
  count: number;
  newCount: number;
  usedCount: number;
  avgPriceFils: Fils;
  totalValueFils: Fils;
}

export interface DealerInventory {
  seller: Seller;
  items: DealerInventoryItem[];
  stats: InventoryStats;
}

export function inventoryStats(items: { priceFils: Fils; condition: 'new' | 'used' }[]): InventoryStats {
  const totalValueFils = items.reduce((s, v) => s + v.priceFils, 0);
  return {
    count: items.length,
    newCount: items.filter((v) => v.condition === 'new').length,
    usedCount: items.filter((v) => v.condition === 'used').length,
    avgPriceFils: items.length ? Math.round(totalValueFils / items.length) : 0,
    totalValueFils,
  };
}

export function dealerInventory(sellerId: string): DealerInventory {
  const seller = findDealer(sellerId);
  if (!seller) throw new DealerError('UNKNOWN_DEALER', `dealer ${sellerId} not found`);
  const items = VEHICLES.filter((v) => v.seller.id === seller.id)
    .map((v) => ({ ...v, fromMonthlyFils: vehicleFromMonthly(v), fromMonthlyMurabahaFils: vehicleFromMonthly(v, 'murabaha') }))
    .sort((a, b) => a.priceFils - b.priceFils);
  return { seller, items, stats: inventoryStats(items) };
}

// ---------------------------------------------------------------------------------------------
// Leads

export type LeadStatus = 'NEW' | 'CONTACTED' | 'TEST_DRIVE' | 'OFFER_SENT' | 'WON' | 'LOST';
export type LeadSource = 'reserved' | 'applied' | 'viewed' | 'bid';

export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'TEST_DRIVE', 'OFFER_SENT', 'WON', 'LOST'];

const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['TEST_DRIVE', 'OFFER_SENT', 'LOST'],
  TEST_DRIVE: ['OFFER_SENT', 'LOST'],
  OFFER_SENT: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

export function nextLeadStatuses(status: LeadStatus): LeadStatus[] {
  return LEAD_TRANSITIONS[status];
}

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_TRANSITIONS[from].includes(to);
}

export function isLeadStatus(x: unknown): x is LeadStatus {
  return typeof x === 'string' && (LEAD_STATUSES as string[]).includes(x);
}

/** What a bid-sourced lead was won at (data the dealer set itself: no customer data). */
export interface LeadBid {
  listPriceFils: Fils;
  /** Price after the dealer's discount */
  priceFils: Fils;
  discountFils: Fils;
  extras: BidExtra[];
}

export interface Lead {
  id: string;
  sellerId: string;
  vehicleId: string;
  vehicleTitle: string;
  /** First name and initial only: the dealer sees full contact details once the customer consents. */
  customerName: Localized;
  source: LeadSource;
  status: LeadStatus;
  /** Customer already holds a pre-approval that covers this car */
  preApproved: boolean;
  /** Source 'bid' only: the list price versus the accepted bid price, with the extras */
  bid?: LeadBid;
  createdAt: string;
  updatedAt: string;
}

export interface LeadStats {
  total: number;
  open: number;
  won: number;
  lost: number;
  byStatus: Record<LeadStatus, number>;
}

export function leadStats(leads: Lead[]): LeadStats {
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const l of leads) byStatus[l.status]++;
  return { total: leads.length, open: leads.length - byStatus.WON - byStatus.LOST, won: byStatus.WON, lost: byStatus.LOST, byStatus };
}

const DEMO_NAMES: Localized[] = [
  { en: 'Ali H.', ar: 'علي ح.' },
  { en: 'Maryam K.', ar: 'مريم ك.' },
  { en: 'Yousif A.', ar: 'يوسف أ.' },
  { en: 'Noora S.', ar: 'نورة س.' },
  { en: 'Hamad J.', ar: 'حمد ج.' },
  { en: 'Zainab M.', ar: 'زينب م.' },
];

const DEMO_PIPELINE: { status: LeadStatus; source: LeadSource; preApproved: boolean }[] = [
  { status: 'NEW', source: 'reserved', preApproved: true },
  { status: 'NEW', source: 'viewed', preApproved: false },
  { status: 'CONTACTED', source: 'applied', preApproved: true },
  { status: 'TEST_DRIVE', source: 'reserved', preApproved: true },
  { status: 'OFFER_SENT', source: 'applied', preApproved: true },
  { status: 'WON', source: 'reserved', preApproved: true },
];

/** ⚠️ Demo leads: a pipeline for each dealer, built from its own inventory. */
export function demoLeads(now: Date = new Date()): Lead[] {
  const out: Lead[] = [];
  for (const seller of DEALER_SELLERS) {
    const stock = VEHICLES.filter((v) => v.seller.id === seller.id);
    DEMO_PIPELINE.forEach((p, i) => {
      const v = stock[i % stock.length]!;
      const created = new Date(now.getTime() - (i + 1) * 26 * 3600 * 1000).toISOString();
      out.push({
        id: `lead-${seller.id}-${i + 1}`,
        sellerId: seller.id,
        vehicleId: v.id,
        vehicleTitle: `${v.make} ${v.model} ${v.year}`,
        customerName: DEMO_NAMES[i % DEMO_NAMES.length]!,
        source: p.source,
        status: p.status,
        preApproved: p.preApproved,
        createdAt: created,
        updatedAt: created,
      });
    });
  }
  return out;
}

/** In-memory lead store (sandbox). Production: the CRM / lead service. */
export class LeadStore {
  private readonly byId = new Map<string, Lead>();

  constructor(seed: Lead[] = demoLeads()) {
    for (const l of seed) this.byId.set(l.id, { ...l });
  }

  list(sellerId: string): Lead[] {
    return [...this.byId.values()].filter((l) => l.sellerId === sellerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(sellerId: string, leadId: string): Lead {
    const lead = this.byId.get(leadId);
    // Another dealer's lead looks exactly like a missing one.
    if (!lead || lead.sellerId !== sellerId) throw new DealerError('LEAD_NOT_FOUND', `lead ${leadId} not found`);
    return lead;
  }

  updateStatus(sellerId: string, leadId: string, status: LeadStatus, now: Date = new Date()): Lead {
    const lead = this.get(sellerId, leadId);
    if (!canTransitionLead(lead.status, status)) {
      throw new DealerError('INVALID_TRANSITION', `cannot move a lead from ${lead.status} to ${status}`);
    }
    const updated = { ...lead, status, updatedAt: now.toISOString() };
    this.byId.set(leadId, updated);
    return updated;
  }
}

// ---------------------------------------------------------------------------------------------
// Pre-approval share token

/** How long a shared token works. Short, because it is shown on screen in a showroom. */
export const PREAPPROVAL_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Crockford base32 without I, L, O, U, so a token read aloud or typed is unambiguous. */
const TOKEN_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TOKEN_LENGTH = 8;

/**
 * Everything a dealer learns from a token. Deliberately minimal (PDPL data minimization):
 * no salary, CPR, obligations, contracts or contact details.
 */
export interface SharedPreApproval {
  firstName: Localized;
  vehicleLimitFils: Fils;
  maxMonthlyFils: Fils;
  /** ISO date until which the pre-approval itself is valid */
  validUntil: string;
  /** ISO timestamp when the token stops working */
  tokenExpiresAt: string;
}

export interface PreApprovalShare {
  /** Opaque, random; formatted XXXX-XXXX for reading aloud */
  token: string;
  expiresAt: string;
  ttlSeconds: number;
}

/** Only the fields a dealer may see, copied out of the full customer record. */
export function sharedPreApprovalFrom(customer: CustomerOverview, tokenExpiresAt: Date): SharedPreApproval {
  const vehicle = customer.preApproval.limits.find((l) => l.productLine === 'vehicle');
  if (!vehicle || vehicle.maxFinanceFils <= 0) throw new DealerError('NO_PREAPPROVAL', 'customer has no vehicle pre-approval to share');
  const first = (s: string) => s.trim().split(/\s+/)[0] ?? '';
  return {
    firstName: { en: first(customer.name.en), ar: first(customer.name.ar) },
    vehicleLimitFils: vehicle.maxFinanceFils,
    maxMonthlyFils: customer.preApproval.maxMonthlyFils,
    validUntil: customer.preApproval.validUntil,
    tokenExpiresAt: tokenExpiresAt.toISOString(),
  };
}

/** Upper-cases and strips spaces and dashes, so "abcd 1234" and "ABCD-1234" are the same token. */
export function normalizeToken(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  // Web Crypto CSPRNG (Node 20+ and browsers); typed locally because this package has no DOM/Node libs.
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto.getRandomValues(bytes);
  // 256 is a multiple of 32, so `% 32` has no bias.
  const raw = [...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * In-memory token store (sandbox). It only ever holds the minimized summary, never the customer record.
 * Production: a short-TTL store (e.g. Redis) behind the API, with audit logging of every redemption.
 */
export class PreApprovalTokenStore {
  private readonly tokens = new Map<string, SharedPreApproval>();

  constructor(
    private readonly ttlMs: number = PREAPPROVAL_TOKEN_TTL_MS,
    private readonly generate: () => string = randomToken,
  ) {}

  issue(customer: CustomerOverview, now: Date = new Date()): PreApprovalShare {
    this.purge(now);
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const summary = sharedPreApprovalFrom(customer, expiresAt);
    let token = this.generate();
    while (this.tokens.has(normalizeToken(token))) token = this.generate();
    this.tokens.set(normalizeToken(token), summary);
    return { token, expiresAt: summary.tokenExpiresAt, ttlSeconds: Math.round(this.ttlMs / 1000) };
  }

  redeem(rawToken: string, now: Date = new Date()): SharedPreApproval {
    const key = normalizeToken(rawToken);
    const summary = this.tokens.get(key);
    if (!summary) throw new DealerError('TOKEN_NOT_FOUND', 'unknown pre-approval token');
    if (now.getTime() >= Date.parse(summary.tokenExpiresAt)) {
      this.tokens.delete(key);
      throw new DealerError('TOKEN_EXPIRED', 'pre-approval token has expired');
    }
    return { ...summary, firstName: { ...summary.firstName } };
  }

  private purge(now: Date): void {
    for (const [k, v] of this.tokens) if (now.getTime() >= Date.parse(v.tokenExpiresAt)) this.tokens.delete(k);
  }
}

// ---------------------------------------------------------------------------------------------
// Showroom offer

export interface ShowroomOfferInput {
  sellerId: string;
  vehicleId: string;
  downPaymentFils: Fils;
  tenureMonths: number;
  /** Defaults to every structure offered for vehicles, side by side */
  structures?: FinanceStructure[];
}

export interface OfferQuote extends FinanceQuote {
  withinFinanceLimit: boolean;
  withinMonthlyLimit: boolean;
  /** Both checks pass: the dealer can proceed on the existing pre-approval */
  withinLimit: boolean;
}

export interface ShowroomOffer {
  sellerId: string;
  vehicle: VehicleListing;
  customer: SharedPreApproval;
  quotes: OfferQuote[];
  /** At least one structure fits the shared limit */
  withinLimit: boolean;
  createdAt: string;
}

export function buildShowroomOffer(customer: SharedPreApproval, input: ShowroomOfferInput, now: Date = new Date()): ShowroomOffer {
  const vehicle = findVehicle(input.vehicleId);
  if (!vehicle) throw new DealerError('VEHICLE_NOT_FOUND', `vehicle ${input.vehicleId} not found`);
  if (vehicle.seller.id !== input.sellerId) {
    throw new DealerError('VEHICLE_NOT_IN_INVENTORY', `vehicle ${input.vehicleId} is not sold by ${input.sellerId}`);
  }
  // One column per structure, even if the request repeats one.
  const structures = input.structures?.length ? [...new Set(input.structures)] : RATE_CARDS.vehicle.structures;
  const quotes = structures.map((structure): OfferQuote => {
    const q = quoteFinance({
      productLine: 'vehicle',
      structure,
      assetPriceFils: vehicle.priceFils,
      downPaymentFils: input.downPaymentFils,
      tenureMonths: input.tenureMonths,
    });
    const withinFinanceLimit = q.financedFils <= customer.vehicleLimitFils;
    const withinMonthlyLimit = q.monthlyFils <= customer.maxMonthlyFils;
    return { ...q, withinFinanceLimit, withinMonthlyLimit, withinLimit: withinFinanceLimit && withinMonthlyLimit };
  });
  return {
    sellerId: input.sellerId,
    vehicle: { ...vehicle, fromMonthlyFils: vehicleFromMonthly(vehicle) },
    customer,
    quotes,
    withinLimit: quotes.some((q) => q.withinLimit),
    createdAt: now.toISOString(),
  };
}
