import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
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
  analysis: { columns: number; slots: (string | null)[] };
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

  addCardToScenario: (scenarioId: string, libraryId: string) => void;
  updateScenarioCard: (scenarioId: string, cardId: string, fn: (d: CardDef) => void) => void;
  unlinkScenarioCard: (scenarioId: string, cardId: string) => void;
  removeScenarioCard: (scenarioId: string, cardId: string) => void;
  moveScenarioCard: (scenarioId: string, cardId: string, beforeCardId: string | null) => void;

  setView: (v: View) => void;
  setPeriod: (p: Period) => void;
  setColumns: (n: number) => void;
  placeInSlot: (slot: number, scenarioId: string) => void;
  clearSlot: (slot: number) => void;
  swapSlots: (a: number, b: number) => void;

  replaceAll: (data: AppData) => void;
}

export type Store = AppData & Actions;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const field = (name: string, expr: string, role: Field['role'] = 'variable'): Field => ({ id: uid(), name, expr, role });

function card(kind: Kind, name: string, value: string, frequency: Frequency, extra: Partial<CardDef> = {}): CardDef {
  return { id: uid(), kind, name, value, frequency, taxable: kind === 'income', fields: [], ...extra };
}

export function emptyData(): AppData {
  return { library: [], scenarios: [], activeScenarioId: null, view: 'build', period: 'monthly', analysis: { columns: 3, slots: [null, null, null] } };
}

export function sampleData(): AppData {
  const salary = card('income', 'Office salary', '72000', 'annually');
  const contract = card('income', 'Remote contract', '=Rate * Hours per week * Weeks', 'annually', {
    fields: [field('Rate', '41'), field('Hours per week', '32'), field('Weeks', '46')],
  });
  const commuter = card('income', 'Commuter benefit', '100', 'monthly', { taxable: false });
  const insurance = card('expense', 'Car insurance', '145', 'monthly');
  const gas = card('expense', 'Gas', '=Fuel Price * Distance / 100 * Efficiency', 'monthly', {
    fields: [field('Fuel Price', '1.62'), field('Distance', '1400'), field('Efficiency', '8.5')],
  });
  const parking = card('expense', 'Downtown parking', '180', 'monthly');
  const transit = card('expense', 'Transit pass', '156', 'monthly');
  const office = card('expense', 'Home office & internet', '=Internet + Equipment / 12', 'monthly', {
    fields: [field('Internet', '65'), field('Equipment', '900')],
  });
  const work = card('hours', 'Office work week', '40', 'weekly');
  const contractHours = card('hours', 'Contract hours', '32', 'weekly');
  const drive = card('hours', 'Driving commute', '=Minutes each way * 2 * Days / 60', 'weekly', {
    fields: [field('Minutes each way', '35'), field('Days', '5')],
  });
  const ride = card('hours', 'Transit commute', '=Minutes each way * 2 * Days / 60', 'weekly', {
    fields: [field('Minutes each way', '55'), field('Days', '5')],
  });
  const meal = card('hours', 'Lunch prep', '2.5', 'weekly');

  const library = [salary, contract, commuter, insurance, gas, parking, transit, office, work, contractHours, drive, ride, meal];
  const place = (d: CardDef) => ({ id: uid(), parentId: d.id, linked: true, def: clone(d) });

  const scenarios: Scenario[] = [
    { id: uid(), name: 'Office · Driving', taxRate: 26, cards: [salary, insurance, gas, parking, work, drive, meal].map(place) },
    { id: uid(), name: 'Office · Transit', taxRate: 26, cards: [salary, commuter, transit, work, ride, meal].map(place) },
    { id: uid(), name: 'Remote contract', taxRate: 30, cards: [contract, office, contractHours].map(place) },
  ];
  return {
    library,
    scenarios,
    activeScenarioId: scenarios[0].id,
    view: 'build',
    period: 'monthly',
    analysis: { columns: 3, slots: scenarios.map((s) => s.id) },
  };
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

      addLibraryCard: (kind) => {
        const d = card(kind, DEFAULTS[kind].name, '0', DEFAULTS[kind].frequency);
        set((s) => { s.library.push(d); });
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
          s.scenarios.push({ id, name: nextName(s.scenarios.map((x) => x.name), 'Scenario'), taxRate: 25, cards: [] });
          s.activeScenarioId = id;
          s.view = 'build';
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
          copy.name = copy.name + ' (copy)';
          copy.cards.forEach((c) => (c.id = uid()));
          s.scenarios.splice(i + 1, 0, copy);
          s.activeScenarioId = copy.id;
        }),
      deleteScenario: (id) =>
        set((s) => {
          const i = s.scenarios.findIndex((x) => x.id === id);
          if (i < 0) return;
          s.scenarios.splice(i, 1);
          s.analysis.slots = s.analysis.slots.map((x) => (x === id ? null : x));
          if (s.activeScenarioId === id) s.activeScenarioId = s.scenarios[Math.min(i, s.scenarios.length - 1)]?.id ?? null;
        }),
      setActive: (id) => set((s) => { s.activeScenarioId = id; }),

      addCardToScenario: (scenarioId, libraryId) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === scenarioId);
          const d = s.library.find((c) => c.id === libraryId);
          if (!sc || !d) return;
          sc.cards.push({ id: uid(), parentId: d.id, linked: true, def: clone(d) });
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
          if (v === 'analysis' && s.analysis.slots.every((x) => x === null || !s.scenarios.some((sc) => sc.id === x))) {
            s.analysis.slots = s.analysis.slots.map((_, i) => s.scenarios[i]?.id ?? null);
          }
        }),
      setPeriod: (p) => set((s) => { s.period = p; }),
      setColumns: (n) =>
        set((s) => {
          const cols = Math.max(1, Math.min(6, n));
          const slots = s.analysis.slots.slice(0, cols);
          while (slots.length < cols) {
            const free = s.scenarios.find((sc) => !slots.includes(sc.id));
            slots.push(free?.id ?? null);
          }
          s.analysis.columns = cols;
          s.analysis.slots = slots;
        }),
      placeInSlot: (slot, scenarioId) =>
        set((s) => {
          const slots = s.analysis.slots;
          const existing = slots.indexOf(scenarioId);
          if (existing >= 0 && existing !== slot) slots[existing] = slots[slot];
          slots[slot] = scenarioId;
        }),
      clearSlot: (slot) => set((s) => { s.analysis.slots[slot] = null; }),
      swapSlots: (a, b) =>
        set((s) => {
          const slots = s.analysis.slots;
          [slots[a], slots[b]] = [slots[b], slots[a]];
        }),

      replaceAll: (data) => set(() => ({ ...data })),
    })),
    {
      name: 'edi-app',
      version: 1,
      partialize: (s): AppData => ({
        library: s.library,
        scenarios: s.scenarios,
        activeScenarioId: s.activeScenarioId,
        view: s.view,
        period: s.period,
        analysis: s.analysis,
      }),
    },
  ),
);

export const getState = () => useStore.getState();
export { clone };
