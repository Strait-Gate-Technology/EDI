import data from './tax-data.json';
import type { Country } from './regions';

type Brackets = [number, number][];

interface CaRegion {
  brackets: Brackets;
  bpa: number | 'federal';
  bpaPhaseOut?: { from: number; to: number };
  employmentAmount?: boolean;
  reduction?: { amount: number; phaseFrom: number; rate: number };
  surtax?: Brackets;
  lowIncomeReduction?: number;
  healthPremium?: [number, number, number, number][];
  note?: string;
}
interface UsRegion {
  brackets: Brackets;
  deduction?: number;
  credit?: number;
  note?: string;
}

export const TAX_YEAR: number = data.year;
export const TAX_ASSUMPTIONS: string[] = data.assumptions;
export const TAX_SOURCES = data.sources;

const CA_FED = data.CA.federal;
const CA_REG = data.CA.regions as unknown as Record<string, CaRegion>;
const US_FED = data.US.federal;
const US_REG = data.US.regions as unknown as Record<string, UsRegion>;

export interface TaxLine {
  label: string;
  amount: number;
}

export interface TaxResult {
  taxable: number;
  federal: number;
  regional: number;
  /** Detail lines (surtax, premiums, abatement…) already included in federal/regional. */
  lines: TaxLine[];
  total: number;
  effectiveRate: number;
  marginalRate: number;
  note?: string;
}

/** Progressive tax on `income` using [lowerThreshold, rate] brackets. */
export function bracketTax(income: number, brackets: Brackets): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [from, rate] = brackets[i];
    if (income <= from) break;
    const to = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    tax += (Math.min(income, to) - from) * rate;
  }
  return tax;
}

function federalBpa(income: number): number {
  const b = CA_FED.bpa;
  if (income <= b.phaseFrom) return b.max;
  if (income >= b.phaseTo) return b.min;
  return b.max - ((income - b.phaseFrom) * (b.max - b.min)) / (b.phaseTo - b.phaseFrom);
}

function canada(income: number, region: string) {
  const lines: TaxLine[] = [];
  const fedRate = CA_FED.brackets[0][1];
  const cea = Math.min(income, CA_FED.employmentAmount);
  let federal = Math.max(0, bracketTax(income, CA_FED.brackets as Brackets) - fedRate * (federalBpa(income) + cea));
  if (region === 'QC' && federal > 0) {
    const abatement = federal * CA_FED.quebecAbatement;
    federal -= abatement;
    lines.push({ label: `Quebec abatement (${CA_FED.quebecAbatement * 100}%)`, amount: -abatement });
  }

  const r = CA_REG[region];
  if (!r) return { federal, regional: 0, lines };
  const low = r.brackets[0][1];
  let bpa = r.bpa === 'federal' ? federalBpa(income) : r.bpa;
  if (r.bpaPhaseOut && typeof r.bpa === 'number') {
    const { from, to } = r.bpaPhaseOut;
    if (income >= to) bpa = 0;
    else if (income > from) bpa = r.bpa - ((income - from) * r.bpa) / (to - from);
  }
  const credits = low * (bpa + (r.employmentAmount ? cea : 0));
  let basic = Math.max(0, bracketTax(income, r.brackets) - credits);

  if (r.surtax) {
    let surtax = 0;
    for (const [threshold, rate] of r.surtax) if (basic > threshold) surtax += (basic - threshold) * rate;
    if (surtax > 0) lines.push({ label: 'Ontario surtax', amount: surtax });
    basic += surtax;
  }
  if (r.lowIncomeReduction) {
    const red = Math.max(0, Math.min(basic, 2 * r.lowIncomeReduction - basic));
    if (red > 0) lines.push({ label: 'Ontario tax reduction', amount: -red });
    basic -= red;
  }
  if (r.reduction) {
    const { amount, phaseFrom, rate } = r.reduction;
    const red = Math.min(basic, Math.max(0, amount - Math.max(0, income - phaseFrom) * rate));
    if (red > 0) lines.push({ label: 'BC tax reduction', amount: -red });
    basic -= red;
  }
  if (r.healthPremium) {
    let prem = 0;
    for (const [from, rate, base, cap] of r.healthPremium) {
      if (income > from) prem = Math.min(cap, base + (income - from) * rate);
    }
    if (prem > 0) lines.push({ label: 'Ontario Health Premium', amount: prem });
    basic += prem;
  }
  return { federal, regional: Math.max(0, basic), lines, note: r.note };
}

function usa(income: number, region: string) {
  const lines: TaxLine[] = [];
  const fedTaxable = Math.max(0, income - US_FED.standardDeduction);
  const federal = bracketTax(fedTaxable, US_FED.brackets as Brackets);
  const r = US_REG[region];
  if (!r || r.brackets.length === 0) return { federal, regional: 0, lines, note: r?.note };
  const stTaxable = Math.max(0, income - (r.deduction ?? 0));
  const regional = Math.max(0, bracketTax(stTaxable, r.brackets) - (r.credit ?? 0));
  return { federal, regional, lines, note: r.note };
}

function raw(income: number, country: Country, region: string) {
  const inc = Math.max(0, income);
  return country === 'CA' ? canada(inc, region) : usa(inc, region);
}

/** Annual personal income tax on `income` (annual taxable income). */
export function computeTax(income: number, country: Country, region: string): TaxResult {
  const r = raw(income, country, region);
  const total = r.federal + r.regional;
  const step = 100;
  const up = raw(income + step, country, region);
  return {
    taxable: Math.max(0, income),
    federal: r.federal,
    regional: r.regional,
    lines: r.lines,
    total,
    effectiveRate: income > 0 ? total / income : 0,
    marginalRate: (up.federal + up.regional - total) / step,
    note: r.note,
  };
}

export function hasIncomeTax(country: Country, region: string): boolean {
  return country === 'CA' || (US_REG[region]?.brackets.length ?? 0) > 0;
}
