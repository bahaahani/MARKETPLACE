import type { CardOffer, VirtualCard } from '../cards';
import type { CustomerView } from '../customer';
import type { Fils, Locale } from '../money';
import type { Policy } from '../policies';
import type { BodyType, Localized, Vehicle, VehicleCondition } from '../types';
import type { AssistantIntent } from './intents';

/** Suhail (male) or Suhaila (female). Only the name, avatar and greeting differ; answers are the same. */
export type AssistantPersona = 'suhail' | 'suhaila';
export const ASSISTANT_PERSONAS: AssistantPersona[] = ['suhail', 'suhaila'];
export const DEFAULT_PERSONA: AssistantPersona = 'suhaila';

export const PERSONA_NAME: Record<AssistantPersona, Localized> = {
  suhail: { en: 'Suhail', ar: 'سهيل' },
  suhaila: { en: 'Suhaila', ar: 'سهيلة' },
};

/**
 * What the assistant may read for the session customer. Built by the API from the session (customerView, policy
 * store, card issuer); the assistant never reads another customer's data and never writes anything.
 */
export interface AssistantContext {
  customer: CustomerView;
  policies: Policy[];
  /** Virtual cards issued to this customer */
  cards: VirtualCard[];
  /** Card products with this customer's eligibility */
  cardOffers: CardOffer[];
  /** Catalog to search (defaults to the demo catalog) */
  vehicles?: Vehicle[];
  now?: Date;
}

/** A row of figures, e.g. a settlement quote. The apps format `amountFils` with their money formatter. */
export interface AssistantAmountRow {
  label: string;
  amountFils: Fils;
  emphasis?: boolean;
}

export interface AssistantVehicleItem {
  id: string;
  title: string;
  year: number;
  condition: VehicleCondition;
  bodyType: BodyType;
  priceFils: Fils;
  fromMonthlyFils: Fils;
  /** Locale-free app path, e.g. /cars/v-honda-city-2026 */
  href: string;
}

export interface AssistantListItem {
  title: string;
  detail: string;
}

export type AssistantCard =
  | { kind: 'amounts'; title: string; rows: AssistantAmountRow[]; note?: string }
  | { kind: 'vehicles'; title: string; items: AssistantVehicleItem[] }
  | { kind: 'list'; title: string; items: AssistantListItem[] };

/**
 * A suggested next step. The assistant NEVER executes it: it is a link to the normal screen (checkout, listing,
 * account) where the customer reviews and confirms. `href` is a locale-free app path: the web prefixes /en or /ar,
 * the Flutter router opens it as is (routes mirror the web URLs).
 */
export interface AssistantAction {
  id: string;
  label: string;
  href: string;
  /** `payment`: opens the checkout, where the customer confirms the payment. `navigate`: opens a screen. */
  kind: 'navigate' | 'payment';
  /** Always true for payments: the customer confirms in the normal UI */
  requiresConfirmation: boolean;
}

export interface AssistantReply {
  id: string;
  persona: AssistantPersona;
  personaName: string;
  /** Language of the answer: the language the customer wrote in (else the app locale) */
  locale: Locale;
  intent: AssistantIntent;
  text: string;
  cards: AssistantCard[];
  actions: AssistantAction[];
  /** Follow-up prompts, in the answer's language */
  suggestions: string[];
  /** Contracts this answer is about (follow-ups such as "and if I pay it all off now?" refer to them) */
  contractIds?: string[];
  /** Set when the conversation was handed to a human (⚠️ sandbox: no agent is connected) */
  handoff?: { reference: string; sandbox: true };
  /** ⚠️ Rules-based sandbox assistant (no language model) */
  sandbox: true;
}

/** One remembered turn (customer text is stored redacted). */
export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
  at: string;
  intent?: AssistantIntent;
  /** Contracts the assistant answered about, for follow-ups like "and if I pay it all now?" */
  contractIds?: string[];
  actions?: AssistantAction[];
}

export interface AssistantRequest {
  text: string;
  locale: Locale;
  persona: AssistantPersona;
  /** Earlier turns of this conversation, oldest first */
  history: AssistantTurn[];
}
