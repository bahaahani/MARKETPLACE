import type { Fils } from './money';
import { bhd } from './money';
import { findVehicle } from './catalog';
import { preApprove, type PreApproval } from './affordability';
import { quoteFinance, type FinanceQuote } from './pricing';
import type { FinanceStructure, Localized } from './types';

export interface Installment {
  number: number;
  dueDate: string; // ISO date
  amountFils: Fils;
  status: 'paid' | 'due' | 'upcoming' | 'overdue';
}

/** Monthly schedule from a quote, first installment one month after `start`. */
export function buildSchedule(quote: FinanceQuote, start: Date, paidCount = 0, today: Date = new Date()): Installment[] {
  const out: Installment[] = [];
  for (let n = 1; n <= quote.tenureMonths; n++) {
    const due = addMonths(start, n);
    const amountFils = n === quote.tenureMonths ? quote.finalInstallmentFils : quote.monthlyFils;
    let status: Installment['status'];
    if (n <= paidCount) status = 'paid';
    else if (due < startOfDay(today)) status = 'overdue';
    else if (n === paidCount + 1) status = 'due';
    else status = 'upcoming';
    out.push({ number: n, dueDate: iso(due), amountFils, status });
  }
  return out;
}

export interface Contract {
  id: string;
  title: Localized;
  structure: FinanceStructure;
  quote: FinanceQuote;
  startDate: string;
  outstandingFils: Fils;
  nextInstallment?: Installment;
  installmentsPaid: number;
  autopay: boolean;
  /** Set once the contract was closed by a captured early-settlement payment (⚠️ sandbox) */
  settlement?: ContractSettlement;
}

export interface ContractSettlement {
  paymentId: string;
  amountFils: Fils;
  /** ISO timestamp */
  settledAt: string;
  /** Bahrain calendar date of settledAt (YYYY-MM-DD), for display */
  settledOn: string;
}

export interface GarageVehicle {
  vehicleId: string;
  title: string;
  plate: string;
  registrationExpiry: string;
  insuranceExpiry: string;
  nextServiceKm: number;
  odometerKm: number;
  contractId?: string;
}

export interface CustomerOverview {
  customerId: string;
  name: Localized;
  monthlySalaryFils: Fils;
  existingObligationsFils: Fils;
  preApproval: PreApproval;
  contracts: Contract[];
  garage: GarageVehicle[];
  rewardsPoints: number;
}

function contractFrom(
  id: string,
  title: Localized,
  structure: FinanceStructure,
  quote: FinanceQuote,
  start: Date,
  paid: number,
  autopay: boolean,
  today: Date,
): Contract {
  const schedule = buildSchedule(quote, start, paid, today);
  const outstandingFils = schedule.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amountFils, 0);
  return {
    id,
    title,
    structure,
    quote,
    startDate: iso(start),
    outstandingFils,
    nextInstallment: schedule.find((i) => i.status !== 'paid'),
    installmentsPaid: paid,
    autopay,
  };
}

/** Demo customer used by the prototype until identity and core-lending integrations exist. */
export function demoCustomer(today: Date = new Date()): CustomerOverview {
  const monthlySalaryFils = bhd(1_400);
  const carQuote = quoteFinance({
    productLine: 'vehicle',
    structure: 'murabaha',
    assetPriceFils: bhd(14_900),
    downPaymentFils: bhd(2_980),
    tenureMonths: 60,
  });
  const personalQuote = quoteFinance({
    productLine: 'personal',
    structure: 'conventional',
    assetPriceFils: bhd(3_000),
    downPaymentFils: 0,
    tenureMonths: 36,
  });
  // Start dates chosen so the next installment falls a few days from `today`.
  const carStart = addDays(addMonths(today, -15), 4);
  const personalStart = addDays(addMonths(today, -8), 11);
  const contracts = [
    contractFrom('c-1001', { en: 'Honda CR-V: Vehicle Murabaha', ar: 'هوندا CR-V: مرابحة سيارات' }, 'murabaha', carQuote, carStart, 14, true, today),
    contractFrom('c-1002', { en: 'Personal Finance', ar: 'تمويل شخصي' }, 'conventional', personalQuote, personalStart, 7, false, today),
  ];
  const existingObligationsFils = contracts.reduce((s, c) => s + c.quote.monthlyFils, 0);
  const cr = findVehicle('v-honda-crv-2026');
  return {
    customerId: 'demo-customer',
    name: { en: 'Fatima Ahmed', ar: 'فاطمة أحمد' },
    monthlySalaryFils,
    existingObligationsFils,
    preApproval: preApprove({ monthlySalaryFils, existingObligationsFils }, today),
    contracts,
    garage: [
      {
        vehicleId: cr?.id ?? 'v-honda-crv-2026',
        title: cr ? `${cr.make} ${cr.model} ${cr.year}` : 'Honda CR-V',
        plate: '123456',
        registrationExpiry: iso(addDays(today, 24)),
        insuranceExpiry: iso(addDays(today, 24)),
        nextServiceKm: 30_000,
        odometerKm: 27_850,
        contractId: 'c-1001',
      },
    ],
    rewardsPoints: 12_480,
  };
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return r;
}

function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
