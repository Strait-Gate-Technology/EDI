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
  | 'annually';

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
}

/** A card placed inside a scenario. While `linked`, it renders its library parent. */
export interface ScenarioCard {
  id: string;
  parentId: string | null;
  linked: boolean;
  /** Own copy — used once unlinked (or if the parent disappears). */
  def: CardDef;
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
}

export const FREQUENCIES: { id: Frequency; label: string; perYear: number }[] = [
  { id: 'daily', label: 'Daily', perYear: 365 },
  { id: 'workday', label: 'Per workday', perYear: 260 },
  { id: 'weekly', label: 'Weekly', perYear: 52 },
  { id: 'biweekly', label: 'Bi-weekly', perYear: 26 },
  { id: 'semimonthly', label: 'Twice monthly', perYear: 24 },
  { id: 'monthly', label: 'Monthly', perYear: 12 },
  { id: 'quarterly', label: 'Quarterly', perYear: 4 },
  { id: 'annually', label: 'Annually', perYear: 1 },
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
