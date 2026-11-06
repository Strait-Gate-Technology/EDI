import { CycleError, FormulaError, evaluateFormula, freeNames, parsePlain, type NameRef } from './formula';
import { computeTax, type TaxResult } from './tax/engine';
import type { Location } from './tax/regions';
import { KIND_META, MAX_ANNUAL_HOURS, PER_YEAR, type CardDef, type Field, type Scenario, type ScenarioCard } from './types';

export const VALUE_ID = '__value';

export interface FieldResult {
  value: number;
  error?: string;
  isFormula: boolean;
  /** Waiting on a scenario variable (library cards): not an error. */
  pending?: boolean;
}

export interface CardResult {
  fields: Map<string, FieldResult>;
  value: FieldResult;
  /** Final value normalised to a year (0 if errored or pending). */
  annual: number;
  hasError: boolean;
  /** Names the card uses that it doesn't define — supplied by each scenario. */
  needs: string[];
  /** Scenario cards: needed names this scenario doesn't define. */
  missing: string[];
}

/** Evaluated scenario variables. */
export interface Scope {
  /** lower-case name → variable */
  byName: Map<string, { id: string; name: string }>;
  results: Map<string, FieldResult>;
}

/** Thrown while evaluating a library card that refers to a scenario variable. */
class PendingError extends FormulaError {}

const SCOPE_REF = '@scope:';
const NEED_REF = '@need:';

type Item = { id: string; name: string; expr: string };

/**
 * Evaluate a set of named fields that may refer to each other (and to outside
 * names through `outside`). Records a result for every field; detects cycles.
 */
function evaluateFields(all: Item[], extraNames: NameRef[], outside: (id: string) => number): Map<string, FieldResult> {
  const byId = new Map(all.map((f) => [f.id, f]));
  const counts = new Map<string, number>();
  for (const f of all) {
    const k = f.name.toLowerCase();
    if (k && f.id !== VALUE_ID) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const own: NameRef[] = all
    .filter((f) => f.id !== VALUE_ID && f.name && counts.get(f.name.toLowerCase()) === 1)
    .map((f) => ({ id: f.id, name: f.name, lower: f.name.toLowerCase() }));
  const ownLower = new Set(all.filter((f) => f.id !== VALUE_ID && f.name).map((f) => f.name.toLowerCase()));
  // Own fields shadow outside names of the same spelling.
  const names = [...own, ...extraNames.filter((n) => !ownLower.has(n.lower))].sort((a, b) => b.lower.length - a.lower.length);

  const results = new Map<string, FieldResult>();
  const visit = (id: string, stack: string[]): number => {
    if (!byId.has(id)) return outside(id);
    const f = byId.get(id)!;
    const done = results.get(id);
    if (done) {
      if (done.pending) throw new PendingError('pending');
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
      if (e instanceof PendingError) {
        results.set(id, { value: NaN, isFormula, pending: true });
        throw e;
      }
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
  return results;
}

const scopeCache = new WeakMap<Field[], Scope>();

/** Evaluate a scenario's variables (they may refer to each other). */
export function evaluateScope(vars: Field[]): Scope {
  const cached = scopeCache.get(vars);
  if (cached) return cached;
  const items = vars.map((v) => ({ id: v.id, name: v.name.trim(), expr: v.expr }));
  const results = evaluateFields(items, [], () => { throw new FormulaError('Unknown reference'); });
  const byName = new Map<string, { id: string; name: string }>();
  for (const v of items) if (v.name && !byName.has(v.name.toLowerCase())) byName.set(v.name.toLowerCase(), { id: v.id, name: v.name });
  const scope = { byName, results };
  scopeCache.set(vars, scope);
  return scope;
}

const freeCache = new WeakMap<CardDef, string[]>();

/** Names used in a card's formulas that the card itself doesn't define. */
export function cardFreeNames(def: CardDef): string[] {
  const cached = freeCache.get(def);
  if (cached) return cached;
  const own: NameRef[] = def.fields
    .filter((f) => f.name.trim())
    .map((f) => ({ id: f.id, name: f.name.trim(), lower: f.name.trim().toLowerCase() }))
    .sort((a, b) => b.lower.length - a.lower.length);
  const found = new Map<string, string>();
  for (const expr of [...def.fields.map((f) => f.expr), def.value]) {
    const e = expr.trim();
    if (!e.startsWith('=')) continue;
    for (const n of freeNames(e.slice(1), own)) if (!found.has(n.toLowerCase())) found.set(n.toLowerCase(), n);
  }
  const out = [...found.values()];
  freeCache.set(def, out);
  return out;
}

const NO_SCOPE = {};
const cardCache = new WeakMap<CardDef, WeakMap<object, CardResult>>();

/**
 * Evaluate a card. Without a scope (library), names the card doesn't define are
 * *pending*; with a scenario's scope they resolve to its variables.
 */
export function evaluateCard(def: CardDef, scope?: Scope): CardResult {
  const key = scope ?? NO_SCOPE;
  let perDef = cardCache.get(def);
  const cached = perDef?.get(key);
  if (cached) return cached;

  const needs = cardFreeNames(def);
  const missing = scope ? needs.filter((n) => !scope.byName.has(n.toLowerCase())) : [];
  const extra: NameRef[] = needs.map((n) => {
    const v = scope?.byName.get(n.toLowerCase());
    return { id: v ? SCOPE_REF + v.id : NEED_REF + n, name: n, lower: n.toLowerCase() };
  });
  const outside = (id: string): number => {
    if (id.startsWith(SCOPE_REF)) {
      const vid = id.slice(SCOPE_REF.length);
      const r = scope!.results.get(vid);
      const name = [...scope!.byName.values()].find((x) => x.id === vid)?.name ?? 'variable';
      if (!r || r.error) throw new FormulaError(`Scenario variable "${name}" has an error`);
      return r.value;
    }
    const name = id.slice(NEED_REF.length);
    if (!scope) throw new PendingError(name);
    throw new FormulaError(`"${name}" isn't a variable of this scenario`);
  };

  const all: Item[] = [
    ...def.fields.map((f) => ({ id: f.id, name: f.name.trim(), expr: f.expr })),
    { id: VALUE_ID, name: KIND_META[def.kind].valueLabel, expr: def.value },
  ];
  const results = evaluateFields(all, extra, outside);

  let value = results.get(VALUE_ID)!;
  if (!value.error && !value.pending && value.value < 0) {
    value = { ...value, error: `${KIND_META[def.kind].label} can't be negative (counted as 0)` };
    results.set(VALUE_ID, value);
  }
  const res: CardResult = {
    fields: results,
    value,
    annual: value.error || value.pending ? 0 : value.value * PER_YEAR[def.frequency],
    hasError: [...results.values()].some((r) => r.error),
    needs,
    missing,
  };
  if (!perDef) cardCache.set(def, (perDef = new WeakMap()));
  perDef.set(key, res);
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
  /** Average hours per week. */
  weeklyHours: number;
  /** More hours than a year holds (24 h x 365): EDI / hour isn't computed. */
  overHours: boolean;
  errors: number;
  scope: Scope;
  counts: { income: number; expense: number; hours: number };
  /** Per-card annualised values, in scenario order. */
  items: { card: ScenarioCard; def: CardDef; annual: number; error: boolean }[];
}

/** All money / hour totals are annual. */
export function scenarioTotals(s: Scenario, library: Map<string, CardDef>, location: Location): ScenarioTotals {
  let taxable = 0, nonTaxable = 0, expenses = 0, hours = 0, errors = 0;
  const counts = { income: 0, expense: 0, hours: 0 };
  const items: ScenarioTotals['items'] = [];
  const scope = evaluateScope(s.variables ?? []);
  for (const card of s.cards) {
    const def = effectiveDef(card, library);
    const r = evaluateCard(def, scope);
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
  const overHours = hours > MAX_ANNUAL_HOURS + 1e-6;
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
    ediPerHour: hours > 0 && !overHours ? edi / hours : null,
    weeklyHours: hours / 52,
    overHours,
    errors,
    scope,
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
