import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { cardFreeNames } from './calc';
import type { SharedProject } from './share';
import { DEFAULT_LOCATION, sameLocation, type Location } from './tax/regions';
import type { CardDef, Field, Frequency, Kind, Period, Scenario } from './types';

export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

export type View = 'build' | 'analysis';

export interface AppData {
  library: CardDef[];
  scenarios: Scenario[];
  activeScenarioId: string | null;
  view: View;
  period: Period;
  /** Scenarios on the Analysis stage, left to right. The stage always shows at least
   *  MIN_COLUMNS columns (empty spots fill the rest) and grows as more are dropped in. */
  analysis: { slots: string[] };
  /** App-wide default nation / province-or-state. */
  location: Location;
  /** Turn off colour cycling & drifting background (for slower machines). */
  reduceEffects: boolean;
}

/** Something just created that the UI should scroll to and focus. Not persisted. */
export interface FocusTarget {
  id: string;
  nonce: number;
}

interface Actions {
  addLibraryCard: (kind: Kind) => string;
  updateLibraryCard: (id: string, fn: (d: CardDef) => void) => void;
  duplicateLibraryCard: (id: string) => void;
  deleteLibraryCard: (id: string) => void;

  addScenario: () => string;
  updateScenario: (id: string, fn: (s: Scenario) => void) => void;
  duplicateScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  setActive: (id: string | null) => void;

  /**
   * Adds a linked copy. Returns the names of scenario variables it had to create
   * (the card uses them but the scenario lacked them), or null if a linked copy of
   * that parent is already there.
   */
  addCardToScenario: (scenarioId: string, libraryId: string) => string[] | null;
  addScenarioVariable: (scenarioId: string) => void;
  updateScenarioVariable: (scenarioId: string, varId: string, fn: (f: Field) => void) => void;
  removeScenarioVariable: (scenarioId: string, varId: string) => void;
  /** Create empty variables for these names (skipping ones that exist). */
  addMissingVariables: (scenarioId: string, names: string[]) => void;
  /** Show a library card (scroll to it, select its name) — e.g. from a linked copy. */
  jumpToLibraryCard: (id: string) => void;
  updateScenarioCard: (scenarioId: string, cardId: string, fn: (d: CardDef) => void) => void;
  unlinkScenarioCard: (scenarioId: string, cardId: string) => void;
  removeScenarioCard: (scenarioId: string, cardId: string) => void;
  moveScenarioCard: (scenarioId: string, cardId: string, beforeCardId: string | null) => void;

  setView: (v: View) => void;
  setPeriod: (p: Period) => void;
  /** Put a scenario on stage at `index` (moving it if already there); past the end = append. */
  insertOnStage: (index: number, scenarioId: string) => void;
  /** Take the scenario at `index` off stage; the stage closes the gap. */
  clearSlot: (index: number) => void;
  swapSlots: (a: number, b: number) => void;

  replaceAll: (data: AppData) => void;

  setLocation: (loc: Location) => void;
  setScenarioLocation: (id: string, loc: Location) => void;
  setReduceEffects: (on: boolean) => void;
  clearFocus: (id: string) => void;
  /** Remove every scenario and library card (keeps location / display settings). */
  startOver: () => void;
  /** Load a shared project: replace everything, or add its cards & scenarios alongside. */
  importProject: (p: SharedProject, mode: 'replace' | 'add') => void;
}

export type MobilePane = 'library' | 'scenario';

export type Store = AppData & Actions & {
  focusTarget: FocusTarget | null;
  /** Which builder pane is shown on phones (not persisted). */
  mobilePane: MobilePane;
  setMobilePane: (p: MobilePane) => void;
};

export const MIN_COLUMNS = 3;

/** A scenario may hold only one *linked* copy of a library card (unlinked copies are free). */
export const hasLinkedCopy = (sc: Scenario, parentId: string) =>
  sc.cards.some((c) => c.linked && c.parentId === parentId);

/** Append empty variables for names the scenario doesn't define yet; returns the new ones. */
function ensureVariables(sc: Scenario, names: string[]): Field[] {
  const have = new Set(sc.variables.map((v) => v.name.trim().toLowerCase()));
  const added: Field[] = [];
  for (const n of names) {
    if (have.has(n.toLowerCase())) continue;
    have.add(n.toLowerCase());
    const f: Field = { id: uid(), name: n, expr: '', role: 'variable' };
    sc.variables.push(f);
    added.push(f);
  }
  return added;
}

/** Older saves / exports stored fixed columns with nulls for empty spots. */
function normaliseAnalysis(a: unknown): AppData['analysis'] {
  const slots = (a as { slots?: unknown[] } | undefined)?.slots ?? [];
  return { slots: [...new Set(slots.filter((x): x is string => typeof x === 'string'))] };
}

/** Give every id in a shared project a fresh uuid (keeps parent links intact). */
function reId(p: SharedProject): SharedProject {
  const map = new Map<string, string>();
  const id = (old: string) => {
    let v = map.get(old);
    if (!v) map.set(old, (v = uid()));
    return v;
  };
  const card = (d: CardDef): CardDef => ({ ...clone(d), id: id(d.id), fields: d.fields.map((f) => ({ ...f, id: uid() })) });
  return {
    ...p,
    library: p.library.map(card),
    scenarios: p.scenarios.map((sc) => ({
      ...clone(sc),
      id: id(sc.id),
      cards: sc.cards.map((c) => ({ ...c, id: uid(), parentId: c.parentId ? id(c.parentId) : null, def: card(c.def) })),
      variables: (sc.variables ?? []).map((f) => ({ ...f, id: uid() })),
    })),
    stage: p.stage.map(id),
  };
}

let nonce = 0;
const focus = (id: string): FocusTarget => ({ id, nonce: ++nonce });

/** Location a scenario actually uses (linked scenarios follow the app-wide one). */
export function scenarioLocation(s: Scenario, global: Location): Location {
  return s.location.linked ? global : { country: s.location.country, region: s.location.region };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const field = (name: string, expr: string, role: Field['role'] = 'variable'): Field => ({ id: uid(), name, expr, role });

function card(kind: Kind, name: string, value: string, frequency: Frequency, extra: Partial<CardDef> = {}): CardDef {
  return { id: uid(), kind, name, value, frequency, taxable: kind === 'income', fields: [], ...extra };
}

export function emptyData(): AppData {
  return {
    library: [], scenarios: [], activeScenarioId: null, view: 'build', period: 'monthly',
    analysis: { slots: [] }, location: { ...DEFAULT_LOCATION }, reduceEffects: false,
  };
}

export function sampleData(): AppData {
  const salary = card('income', 'Office salary', '72000', 'annually');
  const contract = card('income', 'Remote contract', '=Rate * Hours per week * Weeks', 'annually', {
    fields: [field('Rate', '41'), field('Hours per week', '32'), field('Weeks', '46')],
  });
  const commuter = card('income', 'Commuter benefit', '100', 'monthly', { taxable: false });
  const insurance = card('expense', 'Car insurance', '145', 'monthly');
  // Distance comes from each scenario's variables, so one Gas card serves every commute.
  const gas = card('expense', 'Gas', '=Fuel Price * Distance / 100 * Efficiency', 'monthly', {
    fields: [field('Fuel Price', '1.62'), field('Efficiency', '8.5')],
  });
  const parking = card('expense', 'Downtown parking', '180', 'monthly');
  const transit = card('expense', 'Transit pass', '156', 'monthly');
  const office = card('expense', 'Home office & internet', '=Internet + Equipment / 12', 'monthly', {
    fields: [field('Internet', '65'), field('Equipment', '900')],
  });
  const work = card('hours', 'Office work week', '40', 'weekly');
  const contractHours = card('hours', 'Contract hours', '32', 'weekly');
  // "Minutes each way" is a scenario variable: driving and transit differ.
  const commute = card('hours', 'Commute', '=Minutes each way * 2 * Days / 60', 'weekly', {
    fields: [field('Days', '5')],
  });
  const meal = card('hours', 'Lunch prep', '2.5', 'weekly');

  const library = [salary, contract, commuter, insurance, gas, parking, transit, office, work, contractHours, commute, meal];
  const place = (d: CardDef) => ({ id: uid(), parentId: d.id, linked: true, def: clone(d) });

  const loc = () => ({ linked: true, ...DEFAULT_LOCATION });
  const scenarios: Scenario[] = [
    {
      id: uid(), name: 'Office · Driving', location: loc(),
      cards: [salary, insurance, gas, parking, work, commute, meal].map(place),
      variables: [field('Distance', '1400'), field('Minutes each way', '35')],
    },
    {
      id: uid(), name: 'Office · Transit', location: loc(),
      cards: [salary, commuter, transit, work, commute, meal].map(place),
      variables: [field('Minutes each way', '55')],
    },
    {
      id: uid(), name: 'Remote contract', location: { linked: false, country: 'CA', region: 'ON' },
      cards: [contract, office, contractHours].map(place), variables: [],
    },
  ];
  return {
    library,
    scenarios,
    activeScenarioId: scenarios[0].id,
    view: 'build',
    period: 'monthly',
    analysis: { slots: scenarios.map((s) => s.id) },
    location: { ...DEFAULT_LOCATION },
    reduceEffects: false,
  };
}

/** localStorage writes are debounced so typing doesn't serialise the whole state per keystroke. */
function debouncedStorage(delay = 400): StateStorage {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const [k, v] of pending) {
      try { localStorage.setItem(k, v); } catch { /* quota / private mode */ }
    }
    pending.clear();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  }
  return {
    getItem: (k) => pending.get(k) ?? localStorage.getItem(k),
    setItem: (k, v) => {
      pending.set(k, v);
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (k) => {
      pending.delete(k);
      localStorage.removeItem(k);
    },
  };
}

/** "Commute (3)" → "Commute" (also strips the old " (copy)" suffix). */
export const baseName = (name: string) => name.replace(/\s*\((?:\d+|copy)\)\s*$/i, '').trim();

/** First free "Name (n)", n ≥ 2. */
export function uniqueCopyName(base: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}

function nextName(existing: string[], base: string): string {
  let n = existing.length + 1;
  while (existing.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

const DEFAULTS: Record<Kind, { name: string; frequency: Frequency }> = {
  income: { name: 'New income', frequency: 'monthly' },
  expense: { name: 'New expense', frequency: 'monthly' },
  hours: { name: 'New hours', frequency: 'weekly' },
};

export const useStore = create<Store>()(
  persist(
    immer((set, get) => ({
      ...sampleData(),
      focusTarget: null,
      mobilePane: 'scenario',
      setMobilePane: (p) => set((s) => { s.mobilePane = p; }),

      addLibraryCard: (kind) => {
        const d = card(kind, DEFAULTS[kind].name, '0', DEFAULTS[kind].frequency);
        set((s) => {
          s.library.push(d);
          s.focusTarget = focus(d.id);
          s.mobilePane = 'library';
        });
        return d.id;
      },
      updateLibraryCard: (id, fn) =>
        set((s) => {
          const d = s.library.find((c) => c.id === id);
          if (d) fn(d);
        }),
      duplicateLibraryCard: (id) =>
        set((s) => {
          const i = s.library.findIndex((c) => c.id === id);
          if (i < 0) return;
          const copy = clone(s.library[i]);
          copy.id = uid();
          copy.name = copy.name + ' (copy)';
          copy.fields.forEach((f: Field) => (f.id = uid()));
          // keep formulas pointing at names, which are preserved
          s.library.splice(i + 1, 0, copy);
          s.focusTarget = focus(copy.id);
        }),
      deleteLibraryCard: (id) =>
        set((s) => {
          const d = s.library.find((c) => c.id === id);
          if (!d) return;
          for (const sc of s.scenarios)
            for (const c of sc.cards)
              if (c.parentId === id && c.linked) {
                c.def = clone(d);
                c.linked = false;
              }
          s.library = s.library.filter((c) => c.id !== id);
        }),

      addScenario: () => {
        const id = uid();
        set((s) => {
          s.scenarios.push({ id, name: nextName(s.scenarios.map((x) => x.name), 'Scenario'), location: { linked: true, ...s.location }, cards: [], variables: [] });
          s.activeScenarioId = id;
          s.view = 'build';
          s.focusTarget = focus(id);
          s.mobilePane = 'scenario';
        });
        return id;
      },
      updateScenario: (id, fn) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === id);
          if (sc) fn(sc);
        }),
      duplicateScenario: (id) =>
        set((s) => {
          const i = s.scenarios.findIndex((x) => x.id === id);
          if (i < 0) return;
          const copy: Scenario = clone(s.scenarios[i]);
          copy.id = uid();
          const base = baseName(copy.name);
          copy.name = uniqueCopyName(base, s.scenarios.map((x) => x.name));
          copy.cards.forEach((c) => (c.id = uid()));
          copy.variables.forEach((f) => (f.id = uid()));
          // Place it after the last scenario of the same family: A, A (2), A (3)…
          let at = i;
          s.scenarios.forEach((x, j) => { if (baseName(x.name) === base) at = Math.max(at, j); });
          s.scenarios.splice(at + 1, 0, copy);
          s.activeScenarioId = copy.id;
          s.focusTarget = focus(copy.id);
          s.mobilePane = 'scenario';
        }),
      deleteScenario: (id) =>
        set((s) => {
          const i = s.scenarios.findIndex((x) => x.id === id);
          if (i < 0) return;
          s.scenarios.splice(i, 1);
          s.analysis.slots = s.analysis.slots.filter((x) => x !== id);
          if (s.activeScenarioId === id) s.activeScenarioId = s.scenarios[Math.min(i, s.scenarios.length - 1)]?.id ?? null;
        }),
      setActive: (id) => set((s) => { s.activeScenarioId = id; s.mobilePane = 'scenario'; }),

      addCardToScenario: (scenarioId, libraryId) => {
        const cur = get().scenarios.find((x) => x.id === scenarioId);
        const parent = get().library.find((c) => c.id === libraryId);
        if (!cur || !parent || hasLinkedCopy(cur, libraryId)) return null;
        const needs = cardFreeNames(parent);
        let added: string[] = [];
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === scenarioId);
          const d = s.library.find((c) => c.id === libraryId);
          if (!sc || !d) return;
          sc.cards.push({ id: uid(), parentId: d.id, linked: true, def: clone(d) });
          // Variables the card expects but this scenario lacks are created empty.
          const fresh = ensureVariables(sc, needs);
          added = fresh.map((f) => f.name);
          if (fresh.length) s.focusTarget = focus(fresh[0].id);
        });
        return added;
      },
      addScenarioVariable: (scenarioId) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === scenarioId);
          if (!sc) return;
          const names = new Set(sc.variables.map((v) => v.name.trim().toLowerCase()));
          let n = 1;
          while (names.has(`variable ${n}`)) n++;
          const f: Field = { id: uid(), name: `Variable ${n}`, expr: '', role: 'variable' };
          sc.variables.push(f);
          s.focusTarget = focus(f.id + ':name');
        }),
      updateScenarioVariable: (scenarioId, varId, fn) =>
        set((s) => {
          const f = s.scenarios.find((x) => x.id === scenarioId)?.variables.find((v) => v.id === varId);
          if (f) fn(f);
        }),
      removeScenarioVariable: (scenarioId, varId) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === scenarioId);
          if (sc) sc.variables = sc.variables.filter((v) => v.id !== varId);
        }),
      addMissingVariables: (scenarioId, names) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === scenarioId);
          if (!sc) return;
          const fresh = ensureVariables(sc, names);
          if (fresh.length) s.focusTarget = focus(fresh[0].id);
        }),
      jumpToLibraryCard: (id) =>
        set((s) => {
          if (!s.library.some((c) => c.id === id)) return;
          s.view = 'build';
          s.mobilePane = 'library';
          s.focusTarget = focus(id);
        }),
      updateScenarioCard: (scenarioId, cardId, fn) =>
        set((s) => {
          const c = s.scenarios.find((x) => x.id === scenarioId)?.cards.find((x) => x.id === cardId);
          if (c && !c.linked) fn(c.def);
        }),
      unlinkScenarioCard: (scenarioId, cardId) =>
        set((s) => {
          const c = s.scenarios.find((x) => x.id === scenarioId)?.cards.find((x) => x.id === cardId);
          if (!c || !c.linked) return;
          const parent = s.library.find((d) => d.id === c.parentId);
          if (parent) c.def = clone(parent);
          c.def.id = uid();
          c.linked = false;
        }),
      removeScenarioCard: (scenarioId, cardId) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === scenarioId);
          if (sc) sc.cards = sc.cards.filter((c) => c.id !== cardId);
        }),
      moveScenarioCard: (scenarioId, cardId, beforeCardId) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === scenarioId);
          if (!sc || cardId === beforeCardId) return;
          const i = sc.cards.findIndex((c) => c.id === cardId);
          if (i < 0) return;
          const [c] = sc.cards.splice(i, 1);
          const j = beforeCardId ? sc.cards.findIndex((x) => x.id === beforeCardId) : -1;
          if (j < 0) sc.cards.push(c);
          else sc.cards.splice(j, 0, c);
        }),

      setView: (v) =>
        set((s) => {
          s.view = v;
          if (v !== 'analysis') return;
          s.analysis.slots = s.analysis.slots.filter((x) => s.scenarios.some((sc) => sc.id === x));
          // First visit with nothing on stage: start with the first few scenarios.
          if (s.analysis.slots.length === 0) s.analysis.slots = s.scenarios.slice(0, MIN_COLUMNS).map((sc) => sc.id);
        }),
      setPeriod: (p) => set((s) => { s.period = p; }),
      insertOnStage: (index, scenarioId) =>
        set((s) => {
          if (!s.scenarios.some((sc) => sc.id === scenarioId)) return;
          const slots = s.analysis.slots;
          const existing = slots.indexOf(scenarioId);
          if (existing >= 0) {
            slots.splice(existing, 1);
            if (existing < index) index--;
          }
          slots.splice(Math.max(0, Math.min(index, slots.length)), 0, scenarioId);
        }),
      clearSlot: (index) => set((s) => { s.analysis.slots.splice(index, 1); }),
      swapSlots: (a, b) =>
        set((s) => {
          const slots = s.analysis.slots;
          if (a < 0 || b < 0 || a >= slots.length || b >= slots.length) return;
          [slots[a], slots[b]] = [slots[b], slots[a]];
        }),

      replaceAll: (data) =>
        set(() => ({
          ...emptyData(),
          ...data,
          scenarios: (data.scenarios ?? []).map((sc) => ({ ...sc, variables: sc.variables ?? [] })),
          analysis: normaliseAnalysis(data.analysis),
        })),

      setLocation: (loc) => set((s) => { s.location = { ...loc }; }),
      setScenarioLocation: (id, loc) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === id);
          if (!sc) return;
          // Matching the app-wide default re-links it (and drops the name suffix).
          sc.location = { linked: sameLocation(loc, s.location), country: loc.country, region: loc.region };
        }),
      setReduceEffects: (on) => set((s) => { s.reduceEffects = on; }),
      importProject: (p, mode) =>
        set((s) => {
          const fresh = reId(p);
          if (mode === 'replace') {
            s.library = fresh.library;
            s.scenarios = fresh.scenarios;
            s.location = { ...p.location };
            s.period = p.period;
            s.analysis.slots = fresh.stage;
          } else {
            // Shared scenarios that followed the sender's default get that location explicitly.
            for (const sc of fresh.scenarios) {
              const loc = sc.location.linked ? p.location : sc.location;
              sc.location = { linked: sameLocation(loc, s.location), country: loc.country, region: loc.region };
              const names = [...s.scenarios, ...fresh.scenarios.filter((x) => x !== sc)].map((x) => x.name);
              if (names.includes(sc.name)) sc.name = uniqueCopyName(baseName(sc.name), names);
            }
            s.library.push(...fresh.library);
            s.scenarios.push(...fresh.scenarios);
          }
          s.activeScenarioId = fresh.scenarios[0]?.id ?? s.activeScenarioId;
          s.view = 'build';
          s.mobilePane = 'scenario';
          s.focusTarget = null;
        }),
      startOver: () =>
        set((s) => {
          s.library = [];
          s.scenarios = [];
          s.activeScenarioId = null;
          s.view = 'build';
          s.analysis.slots = [];
          s.focusTarget = null;
        }),
      clearFocus: (id) => set((s) => { if (s.focusTarget?.id === id) s.focusTarget = null; }),
    })),
    {
      name: 'edi-app',
      version: 4,
      storage: createJSONStorage(() => debouncedStorage()),
      migrate: (persisted, version) => {
        const d = persisted as AppData & { scenarios: (Scenario & { taxRate?: number })[] };
        if (version < 2) {
          d.location ??= { ...DEFAULT_LOCATION };
          d.reduceEffects ??= false;
          for (const sc of d.scenarios ?? []) {
            delete sc.taxRate;
            sc.location ??= { linked: true, ...d.location };
          }
        }
        if (version < 3) d.analysis = normaliseAnalysis(d.analysis);
        if (version < 4) for (const sc of d.scenarios ?? []) sc.variables ??= [];
        return d;
      },
      partialize: (s): AppData => ({
        library: s.library,
        scenarios: s.scenarios,
        activeScenarioId: s.activeScenarioId,
        view: s.view,
        period: s.period,
        analysis: s.analysis,
        location: s.location,
        reduceEffects: s.reduceEffects,
      }),
    },
  ),
);

export const getState = () => useStore.getState();
export { clone };
