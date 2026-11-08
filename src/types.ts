import type { Country } from './tax/regions';

export type Kind = 'income' | 'expense' | 'hours';

export type Frequency =
  | 'daily'
  | 'workday'
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'annually'
  | 'once';

export type Period = 'weekly' | 'monthly' | 'annually';

/** A named slot inside a card. `expr` is either a plain number or an `=formula`. */
export interface Field {
  id: string;
  name: string;
  expr: string;
  role: 'variable' | 'equation';
}

/** The definition of an Income / Expense / Hours card. */
export interface CardDef {
  id: string;
  kind: Kind;
  name: string;
  frequency: Frequency;
  /** Only meaningful for income cards. */
  taxable: boolean;
  fields: Field[];
  /** Final value: number or `=formula`. */
  value: string;
  /** One-time cards: ISO date (yyyy-mm-dd) it's received / paid. Empty = start of the period. */
  date?: string;
}

/** A card placed inside a scenario. While `linked`, it renders its library parent. */
export interface ScenarioCard {
  id: string;
  parentId: string | null;
  linked: boolean;
  /** Own copy — used once unlinked (or if the parent disappears). */
  def: CardDef;
  /**
   * Linked one-time cards: this scenario's own date.
   * undefined → follow the library card; null → no date (start of the period).
   */
  date?: string | null;
}

export interface ScenarioLocation {
  /** While linked, the scenario follows the app-wide location. */
  linked: boolean;
  country: Country;
  region: string;
}

export interface Scenario {
  id: string;
  name: string;
  location: ScenarioLocation;
  cards: ScenarioCard[];
  /** Scenario-specific values (e.g. Distance) that cards can refer to by name. */
  variables: Field[];
  /** Optional Period of Interest (ISO dates, end inclusive). Set → the scenario is time-aware. */
  poi?: PeriodOfInterest;
}

export type PoiStartUnit = 'year' | 'month' | 'day';
export type PoiLengthUnit = 'days' | 'weeks' | 'months' | 'years';

export interface PeriodOfInterest {
  /** Resolved ISO start (kept up to date by resolvePoi). */
  start?: string;
  /** Resolved ISO end, inclusive (derived from `length` when that is set). */
  end?: string;
  /** How the start was picked. Absent = 'day' (older data). */
  startUnit?: PoiStartUnit;
  /** Set → end = start + length − 1 day; absent → `end` is an explicit date. */
  length?: { n: number; unit: PoiLengthUnit };
}

const isoDay = (iso?: string): number | null => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return Number.isFinite(t) ? Math.round(t / 86400000) : null;
};
const dayIso = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Today as a local-calendar ISO date. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The day after a period of `n` units starting on `iso`. Months and years are calendar-aware:
 * when the start day doesn't exist in the target month (Jan 31 + 1 month), the period runs to
 * that month's last day.
 */
function addLength(iso: string, n: number, unit: PoiLengthUnit): number | null {
  const a = isoDay(iso);
  if (a == null) return null;
  if (unit === 'days') return a + n;
  if (unit === 'weeks') return a + 7 * n;
  const [y, m, d] = iso.split('-').map(Number);
  const months = unit === 'years' ? 12 * n : n;
  const ty = y + Math.floor((m - 1 + months) / 12);
  const tm = (((m - 1 + months) % 12) + 12) % 12;
  const dim = daysInMonth(ty, tm);
  return d > dim ? Math.round(Date.UTC(ty, tm + 1, 1) / 86400000) : Math.round(Date.UTC(ty, tm, d) / 86400000);
}

export const validLength = (l?: PeriodOfInterest['length']) => !!l && Number.isInteger(l.n) && l.n >= 1 && l.n <= 10000;

/** Snap the start to its unit and derive `end` from `length` when set. */
export function resolvePoi(spec: PeriodOfInterest): PeriodOfInterest {
  const out: PeriodOfInterest = { ...spec };
  if (out.start && isoDay(out.start) != null) {
    if (out.startUnit === 'year') out.start = out.start.slice(0, 4) + '-01-01';
    else if (out.startUnit === 'month') out.start = out.start.slice(0, 7) + '-01';
  }
  if (out.length) {
    const next = validLength(out.length) && out.start ? addLength(out.start, out.length.n, out.length.unit) : null;
    out.end = next == null ? undefined : dayIso(next - 1);
  }
  return out;
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const at = (iso: string) => new Date(isoDay(iso)! * 86400000);

const unitWord = (n: number, unit: PoiLengthUnit) => `${n} ${n === 1 ? unit.slice(0, -1) : unit}`;

/** Days in a Period of Interest (end inclusive), or null when it isn't a valid range. */
export function poiDays(poi?: PeriodOfInterest | null): number | null {
  const a = isoDay(poi?.start);
  const b = isoDay(poi?.end);
  return a != null && b != null && b > a ? b - a + 1 : null;
}

/** A scenario is time-aware only once its Period of Interest is set (and valid). */
export const isTimeAware = (sc: { poi?: PeriodOfInterest }) => poiDays(sc.poi) != null;

/** Is an ISO date inside the (valid) period? */
export function inPeriod(iso: string, poi: PeriodOfInterest): boolean {
  const d = isoDay(iso);
  const a = isoDay(poi.start);
  const b = isoDay(poi.end);
  return d != null && a != null && b != null && d >= a && d <= b;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
/** "Mar 1, 2026" */
export function fmtDate(iso?: string): string {
  const d = isoDay(iso);
  return d == null ? '' : dateFmt.format(new Date(d * 86400000));
}
/** Exact range, e.g. "Mar 1 – Aug 31, 2026" (year shown once when shared). */
export function fmtPeriod(poi: PeriodOfInterest): string {
  if (!poi.start || isoDay(poi.start) == null) return '';
  if (!poi.end || isoDay(poi.end) == null) return `From ${fmtDate(poi.start)}`;
  return poi.start.slice(0, 4) === poi.end.slice(0, 4)
    ? `${shortFmt.format(at(poi.start))} – ${fmtDate(poi.end)}`
    : `${fmtDate(poi.start)} – ${fmtDate(poi.end)}`;
}

/** Start as the user picked it: "2026", "Mar 2026" or "Mar 15, 2026". */
function fmtStart(poi: PeriodOfInterest): string {
  if (!poi.start || isoDay(poi.start) == null) return '';
  if (poi.startUnit === 'year') return poi.start.slice(0, 4);
  if (poi.startUnit === 'month') return monthFmt.format(at(poi.start));
  return fmtDate(poi.start);
}

/**
 * Compact label at the precision the user chose: "2026 · 1 year", "Mar 2026 · 6 months",
 * "Mar 15, 2026 · 90 days", or an exact range when the end was picked as a date.
 */
export function describePoi(poi?: PeriodOfInterest | null): string {
  if (!poi?.start) return '';
  if (poi.length && validLength(poi.length)) return `${fmtStart(poi)} · ${unitWord(poi.length.n, poi.length.unit)}`;
  if (poi.length) return `${fmtStart(poi)} · set a length`;
  return poi.end ? fmtPeriod(poi) : `${fmtStart(poi)} · no end`;
}

/** Tooltip detail: exact range and day count. */
export function poiDetail(poi?: PeriodOfInterest | null): string {
  const days = poiDays(poi);
  return poi && days ? `${fmtPeriod(poi)} (${days} days)` : '';
}

/** Physical limit on hours: 24 h × 365 days (shown as 168 h/week). */
export const MAX_ANNUAL_HOURS = 24 * 365;

export const FREQUENCIES: { id: Frequency; label: string; perYear: number }[] = [
  { id: 'daily', label: 'Daily', perYear: 365 },
  { id: 'workday', label: 'Per workday', perYear: 260 },
  { id: 'weekly', label: 'Weekly', perYear: 52 },
  { id: 'biweekly', label: 'Bi-weekly', perYear: 26 },
  { id: 'semimonthly', label: 'Twice monthly', perYear: 24 },
  { id: 'monthly', label: 'Monthly', perYear: 12 },
  { id: 'quarterly', label: 'Quarterly', perYear: 4 },
  { id: 'annually', label: 'Annually', perYear: 1 },
  /** Lump sum: counted over the scenario's Period of Interest, not per year. */
  { id: 'once', label: 'One-time', perYear: 0 },
];

export const PER_YEAR: Record<Frequency, number> = Object.fromEntries(
  FREQUENCIES.map((f) => [f.id, f.perYear]),
) as Record<Frequency, number>;

export const PERIODS: { id: Period; label: string; short: string; perYear: number }[] = [
  { id: 'weekly', label: 'Weekly', short: 'wk', perYear: 52 },
  { id: 'monthly', label: 'Monthly', short: 'mo', perYear: 12 },
  { id: 'annually', label: 'Annual', short: 'yr', perYear: 1 },
];

export const KIND_META: Record<Kind, { label: string; plural: string; valueLabel: string; unit: '$' | 'h' }> = {
  income: { label: 'Income', plural: 'Incomes', valueLabel: 'Income ($)', unit: '$' },
  expense: { label: 'Expense', plural: 'Expenses', valueLabel: 'Expense ($)', unit: '$' },
  hours: { label: 'Hours', plural: 'Hours', valueLabel: 'Hours (h)', unit: 'h' },
};

export const KINDS: Kind[] = ['income', 'expense', 'hours'];
