import type { Contract } from '../account';
import type { PreApproval } from '../affordability';
import { VEHICLES } from '../catalog';
import type { VirtualCardStatus } from '../cards';
import { addDaysIso, bahrainToday } from '../insurance-common';
import type { Fils } from '../money';
import type { InsuranceLine } from '../insurance-common';
import { searchVehicles, type VehicleFilters, type VehicleListing } from '../search';
import { settlementQuote, SettlementError, type SettlementQuote } from '../settlement';
import type { BodyType, FinanceStructure, FuelType, Localized, VehicleCondition } from '../types';
import type { AssistantContext } from './types';

/**
 * The assistant's tools: READ-ONLY functions over the session customer's data, each calling the existing domain
 * logic (settlementQuote, searchVehicles, the pre-approval, the policy and card stores' results).
 *
 * The same registry serves both brains:
 * - RulesBrain maps a detected intent to one tool call;
 * - ⚠️ a future LLM brain would send ASSISTANT_TOOLS (name, description, JSON-Schema parameters) to the model as
 *   tool definitions and run the model's tool calls with runAssistantTool(). The model then only writes the text:
 *   cards and actions are still built from the tool results by presentToolResult(), so it cannot invent an amount
 *   or a link.
 *
 * There is deliberately NO tool that pays, signs, applies or changes a setting. Anything that moves money is a
 * suggested action (a link to the checkout) that the customer confirms in the normal UI.
 */

export type AssistantToolName =
  | 'get_outstanding_balance'
  | 'get_next_installment'
  | 'get_settlement_quote'
  | 'search_vehicles'
  | 'get_pre_approval'
  | 'list_policies'
  | 'get_card_status'
  | 'request_human_handoff';

interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, { type: 'string' | 'integer' | 'boolean'; enum?: string[]; description: string }>;
  additionalProperties: false;
}

export interface AssistantToolDefinition {
  name: AssistantToolName;
  description: string;
  parameters: JsonSchemaObject;
}

const CONTRACT_ID = { type: 'string', description: "One of the customer's contract ids (omit for all contracts)" } as const;

export const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'get_outstanding_balance',
    description: 'Amount still to pay on each of the customer\'s finance contracts (sum of unpaid installments).',
    parameters: { type: 'object', properties: { contractId: CONTRACT_ID }, additionalProperties: false },
  },
  {
    name: 'get_next_installment',
    description: 'Next installment due on each open contract: date, amount, autopay.',
    parameters: { type: 'object', properties: { contractId: CONTRACT_ID }, additionalProperties: false },
  },
  {
    name: 'get_settlement_quote',
    description: 'Early-settlement quote (conventional fee or Murabaha Ibra\') for open contracts. Does not settle anything.',
    parameters: { type: 'object', properties: { contractId: CONTRACT_ID }, additionalProperties: false },
  },
  {
    name: 'search_vehicles',
    description: 'Search the car catalog by monthly budget, price, body type, fuel, condition or make; cheapest first.',
    parameters: {
      type: 'object',
      properties: {
        maxMonthlyFils: { type: 'integer', description: 'Highest "from" monthly installment, in fils' },
        maxPriceFils: { type: 'integer', description: 'Highest cash price, in fils' },
        bodyType: { type: 'string', enum: ['sedan', 'suv', 'hatchback', 'pickup', 'coupe'], description: 'Body type' },
        fuel: { type: 'string', enum: ['petrol', 'hybrid', 'electric'], description: 'Fuel' },
        condition: { type: 'string', enum: ['new', 'used'], description: 'New or used' },
        make: { type: 'string', description: 'Make, e.g. Honda' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_pre_approval',
    description: 'The customer\'s indicative pre-approval: monthly headroom, limits per product line, card limit.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_policies',
    description: 'Active insurance policies and anything expiring soon (including the motor cover of cars in My Garage).',
    parameters: {
      type: 'object',
      properties: { expiringWithinDays: { type: 'integer', description: 'Only what ends within this many days' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_card_status',
    description: 'The customer\'s IMTIAZ cards (masked) and, without a card, the best card they are eligible for.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'request_human_handoff',
    description: 'Hand the conversation to a customer service agent.',
    parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Short reason, no personal data' } }, additionalProperties: false },
  },
];

// ---- Results

export interface ContractSummary {
  id: string;
  title: Localized;
  structure: FinanceStructure;
  productLine: Contract['quote']['productLine'];
  outstandingFils: Fils;
  installmentsPaid: number;
  installmentsTotal: number;
  settledOn?: string;
}

export interface NextInstallmentItem {
  contractId: string;
  title: Localized;
  number: number;
  dueDate: string;
  amountFils: Fils;
  status: 'due' | 'overdue' | 'upcoming' | 'paid';
  autopay: boolean;
}

export interface SettlementItem {
  contractId: string;
  title: Localized;
  quote?: SettlementQuote;
  /** Why there is no quote (already settled / fully paid) */
  unavailable?: 'ALREADY_SETTLED' | 'NOTHING_TO_SETTLE';
}

export interface PolicySummary {
  id: string;
  line: InsuranceLine;
  insurerName: Localized;
  takaful: boolean;
  endDate: string;
  daysLeft: number;
}

export interface GarageCover {
  vehicleTitle: string;
  insuranceExpiry: string;
  daysLeft: number;
}

export interface CardSummary {
  id: string;
  name: Localized;
  last4: string;
  status: VirtualCardStatus;
  limitFils: Fils;
}

export type AssistantToolResult =
  | { tool: 'get_outstanding_balance'; contracts: ContractSummary[]; totalOutstandingFils: Fils }
  | { tool: 'get_next_installment'; items: NextInstallmentItem[] }
  | { tool: 'get_settlement_quote'; items: SettlementItem[] }
  | { tool: 'search_vehicles'; filters: VehicleFilters; items: VehicleListing[]; total: number }
  | { tool: 'get_pre_approval'; preApproval: PreApproval; onboarded: boolean }
  | { tool: 'list_policies'; withinDays: number; active: PolicySummary[]; expiringSoon: PolicySummary[]; garage: GarageCover[] }
  | { tool: 'get_card_status'; cards: CardSummary[]; bestOffer?: { cardId: string; name: Localized; offeredLimitFils: Fils } }
  | { tool: 'request_human_handoff'; reference: string };

export interface AssistantToolArgs {
  contractId?: string;
  maxMonthlyFils?: Fils;
  maxPriceFils?: Fils;
  bodyType?: BodyType;
  fuel?: FuelType;
  condition?: VehicleCondition;
  make?: string;
  expiringWithinDays?: number;
}

/** Default "expiring soon" window. ⚠️ VERIFY with Product (renewal reminders). */
export const EXPIRING_SOON_DAYS = 30;
export const VEHICLE_RESULTS_SHOWN = 4;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function contractsFor(ctx: AssistantContext, contractId?: string): Contract[] {
  const all = ctx.customer.contracts;
  if (!contractId) return all;
  return all.filter((c) => c.id === contractId);
}

let handoffSeq = 0;

/**
 * Runs one tool for the session customer. Unknown tools and bad arguments throw (an LLM brain must catch that and
 * tell the model); arguments are validated here, never trusted from the caller.
 */
export function runAssistantTool(ctx: AssistantContext, name: AssistantToolName, args: AssistantToolArgs = {}): AssistantToolResult {
  const now = ctx.now ?? new Date();
  const today = bahrainToday(now);
  switch (name) {
    case 'get_outstanding_balance': {
      const contracts = contractsFor(ctx, args.contractId).map(
        (c): ContractSummary => ({
          id: c.id,
          title: c.title,
          structure: c.structure,
          productLine: c.quote.productLine,
          outstandingFils: c.outstandingFils,
          installmentsPaid: c.installmentsPaid,
          installmentsTotal: c.quote.tenureMonths,
          ...(c.settlement ? { settledOn: c.settlement.settledOn } : {}),
        }),
      );
      return { tool: name, contracts, totalOutstandingFils: contracts.reduce((s, c) => s + c.outstandingFils, 0) };
    }
    case 'get_next_installment': {
      const items = contractsFor(ctx, args.contractId)
        .filter((c) => c.nextInstallment && !c.settlement)
        .map((c): NextInstallmentItem => {
          const i = c.nextInstallment!;
          return { contractId: c.id, title: c.title, number: i.number, dueDate: i.dueDate, amountFils: i.amountFils, status: i.status, autopay: c.autopay };
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return { tool: name, items };
    }
    case 'get_settlement_quote': {
      const items = contractsFor(ctx, args.contractId).map((c): SettlementItem => {
        try {
          return { contractId: c.id, title: c.title, quote: settlementQuote(c, now) };
        } catch (e) {
          if (e instanceof SettlementError && (e.code === 'ALREADY_SETTLED' || e.code === 'NOTHING_TO_SETTLE')) {
            return { contractId: c.id, title: c.title, unavailable: e.code };
          }
          throw e;
        }
      });
      return { tool: name, items };
    }
    case 'search_vehicles': {
      const filters: VehicleFilters = {};
      if (isPositiveInt(args.maxMonthlyFils)) filters.maxMonthlyFils = args.maxMonthlyFils;
      if (isPositiveInt(args.maxPriceFils)) filters.maxPriceFils = args.maxPriceFils;
      if (args.bodyType) filters.bodyType = args.bodyType;
      if (args.fuel) filters.fuel = args.fuel;
      if (args.condition) filters.condition = args.condition;
      if (args.make) filters.make = args.make;
      const rows = searchVehicles(ctx.vehicles ?? VEHICLES, filters);
      return { tool: name, filters, items: rows.slice(0, VEHICLE_RESULTS_SHOWN), total: rows.length };
    }
    case 'get_pre_approval':
      return { tool: name, preApproval: ctx.customer.preApproval, onboarded: ctx.customer.onboarded };
    case 'list_policies': {
      const withinDays = isPositiveInt(args.expiringWithinDays) ? args.expiringWithinDays : EXPIRING_SOON_DAYS;
      const active = ctx.policies
        .filter((p) => p.status === 'ACTIVE')
        .map((p): PolicySummary => ({
          id: p.id,
          line: p.line,
          insurerName: p.insurerName,
          takaful: p.takaful,
          endDate: p.endDate,
          daysLeft: daysBetween(today, p.endDate),
        }));
      const limit = addDaysIso(today, withinDays);
      const garage = ctx.customer.garage
        .filter((g) => g.insuranceExpiry >= today && g.insuranceExpiry <= limit)
        .map((g): GarageCover => ({ vehicleTitle: g.title, insuranceExpiry: g.insuranceExpiry, daysLeft: daysBetween(today, g.insuranceExpiry) }));
      return { tool: name, withinDays, active, expiringSoon: active.filter((p) => p.endDate <= limit), garage };
    }
    case 'get_card_status': {
      const cards = ctx.cards.map((c): CardSummary => ({ id: c.id, name: c.name, last4: c.last4, status: c.status, limitFils: c.limitFils }));
      const owned = new Set(ctx.cards.map((c) => c.cardId));
      const best = ctx.cardOffers
        .filter((o) => o.eligible && o.tier !== 'prepaid' && !owned.has(o.id))
        .sort((a, b) => b.annualFeeFils - a.annualFeeFils)[0];
      return {
        tool: name,
        cards,
        ...(best ? { bestOffer: { cardId: best.id, name: best.name, offeredLimitFils: best.offeredLimitFils } } : {}),
      };
    }
    case 'request_human_handoff':
      // ⚠️ Sandbox: no contact-centre integration. Production opens a case with the redacted transcript.
      // Letters and short digit groups, so the reference never looks like a CPR to redactPii().
      return { tool: name, reference: `HO-SBX-${(++handoffSeq).toString(36).toUpperCase().padStart(5, '0')}` };
    default:
      throw new Error(`unknown assistant tool ${String(name)}`);
  }
}

function isPositiveInt(v: unknown): v is number {
  return Number.isSafeInteger(v) && (v as number) > 0;
}
