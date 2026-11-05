import { CycleError, FormulaError, evaluateFormula, parsePlain, type NameRef } from './formula';
import { computeTax, type TaxResult } from './tax/engine';
import type { Location } from './tax/regions';
import { KIND_META, PER_YEAR, type CardDef, type Scenario, type ScenarioCard } from './types';

export const VALUE_ID = '__value';

export interface FieldResult {
  value: number;
  error?: string;
  isFormula: boolean;
}

export interface CardResult {
  fields: Map<string, FieldResult>;
  value: FieldResult;
  /** Final value normalised to a year (0 if errored). */
  annual: number;
  hasError: boolean;
}

const cardCache = new WeakMap<CardDef, CardResult>();

export function evaluateCard(def: CardDef): CardResult {
  const cached = cardCache.get(def);
  if (cached) return cached;

  const all = [
    ...def.fields.map((f) => ({ id: f.id, name: f.name.trim(), expr: f.expr })),
    { id: VALUE_ID, name: KIND_META[def.kind].valueLabel, expr: def.value },
  ];
  const byId = new Map(all.map((f) => [f.id, f]));

  const counts = new Map<string, number>();
  for (const f of def.fields) {
    const k = f.name.trim().toLowerCase();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const names: NameRef[] = def.fields
    .filter((f) => f.name.trim() && counts.get(f.name.trim().toLowerCase()) === 1)
    .map((f) => ({ id: f.id, name: f.name.trim(), lower: f.name.trim().toLowerCase() }))
    .sort((a, b) => b.lower.length - a.lower.length);

  const results = new Map<string, FieldResult>();

  const visit = (id: string, stack: string[]): number => {
    const f = byId.get(id)!;
    const done = results.get(id);
    if (done) {
      if (done.error) throw new FormulaError(`"${f.name}" has an error`);
      return done.value;
    }
    const idx = stack.indexOf(id);
    if (idx >= 0) {
      const ids = [...stack.slice(idx), id];
      throw new CycleError(ids, ids.map((i) => byId.get(i)!.name || 'unnamed'));
    }
    const expr = f.expr.trim();
    const isFormula = expr.startsWith('=');
    try {
      if (id !== VALUE_ID && f.name && (counts.get(f.name.toLowerCase()) ?? 0) > 1) {
        throw new FormulaError('Duplicate variable name');
      }
      const v = isFormula
        ? evaluateFormula(expr.slice(1), names, (rid) => visit(rid, [...stack, id]))
        : parsePlain(expr);
      results.set(id, { value: v, isFormula });
      return v;
    } catch (e) {
      if (e instanceof CycleError) {
        const error = e.ids.includes(id) ? e.message : 'Depends on a circular reference';
        results.set(id, { value: NaN, error, isFormula });
        throw e;
      }
      const error = e instanceof Error ? e.message : String(e);
      results.set(id, { value: NaN, error, isFormula });
      throw new FormulaError(`"${f.name}" has an error`);
    }
  };

  for (const f of all) {
    if (!results.has(f.id)) {
      try { visit(f.id, []); } catch { /* recorded in results */ }
    }
  }

  const value = results.get(VALUE_ID)!;
  const res: CardResult = {
    fields: results,
    value,
    annual: value.error ? 0 : value.value * PER_YEAR[def.frequency],
    hasError: [...results.values()].some((r) => r.error),
  };
  cardCache.set(def, res);
  return res;
}

export function effectiveDef(card: ScenarioCard, library: Map<string, CardDef>): CardDef {
  if (card.linked && card.parentId) return library.get(card.parentId) ?? card.def;
  return card.def;
}

export interface ScenarioTotals {
  taxableIncome: number;
  nonTaxableIncome: number;
  grossIncome: number;
  tax: number;
  taxDetail: TaxResult;
  location: Location;
  netIncome: number;
  expenses: number;
  edi: number;
  hours: number;
  ediPerHour: number | null;
  errors: number;
  counts: { income: number; expense: number; hours: number };
  /** Per-card annualised values, in scenario order. */
  items: { card: ScenarioCard; def: CardDef; annual: number; error: boolean }[];
}

/** All money / hour totals are annual. */
export function scenarioTotals(s: Scenario, library: Map<string, CardDef>, location: Location): ScenarioTotals {
  let taxable = 0, nonTaxable = 0, expenses = 0, hours = 0, errors = 0;
  const counts = { income: 0, expense: 0, hours: 0 };
  const items: ScenarioTotals['items'] = [];
  for (const card of s.cards) {
    const def = effectiveDef(card, library);
    const r = evaluateCard(def);
    counts[def.kind]++;
    if (r.hasError) errors++;
    items.push({ card, def, annual: r.annual, error: r.hasError });
    if (def.kind === 'income') {
      if (def.taxable) taxable += r.annual;
      else nonTaxable += r.annual;
    } else if (def.kind === 'expense') expenses += r.annual;
    else hours += r.annual;
  }
  const taxDetail = computeTax(taxable, location.country, location.region);
  const tax = taxDetail.total;
  const netIncome = taxable - tax + nonTaxable;
  const edi = netIncome - expenses;
  return {
    taxableIncome: taxable,
    nonTaxableIncome: nonTaxable,
    grossIncome: taxable + nonTaxable,
    tax,
    taxDetail,
    location,
    netIncome,
    expenses,
    edi,
    hours,
    ediPerHour: hours > 0 ? edi / hours : null,
    errors,
    counts,
    items,
  };
}

const moneyFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFmt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const hourFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function money(n: number, whole = false): string {
  if (!Number.isFinite(n)) return '—';
  const s = (whole ? moneyFmt0 : moneyFmt).format(Math.abs(n));
  return (n < 0 ? '−$' : '$') + s;
}
export const hoursFmt = (n: number) => (Number.isFinite(n) ? hourFmt.format(n) + ' h' : '—');
export const num = (n: number) => (Number.isFinite(n) ? numFmt.format(n) : '—');
export const pct = (n: number) => (Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : '—');
export const fmtUnit = (n: number, unit: '$' | 'h') => (unit === '$' ? money(n) : hoursFmt(n));
