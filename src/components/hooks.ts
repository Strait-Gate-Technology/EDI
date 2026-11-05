import { useMemo } from 'react';
import { scenarioTotals, type ScenarioTotals } from '../calc';
import { scenarioLocation, useStore } from '../store';
import type { CardDef, Scenario } from '../types';
import type { Location } from '../tax/regions';

export const DRAG_SCENARIO = 'application/x-edi-scenario';
export const DRAG_SLOT = 'application/x-edi-slot';

export function useLibraryMap() {
  const library = useStore((s) => s.library);
  return useMemo(() => new Map<string, CardDef>(library.map((c) => [c.id, c])), [library]);
}

// One shared computation per state change, however many components ask.
let memo: { scenarios: Scenario[]; lib: Map<string, CardDef>; loc: Location; out: Map<string, ScenarioTotals> } | null = null;
// Per-scenario cache so editing one scenario doesn't recompute the others.
const perScenario = new WeakMap<Scenario, { lib: Map<string, CardDef>; loc: Location; t: ScenarioTotals }>();

export function useAllTotals(): Map<string, ScenarioTotals> {
  const scenarios = useStore((s) => s.scenarios);
  const loc = useStore((s) => s.location);
  const lib = useLibraryMap();
  return useMemo(() => {
    if (memo && memo.scenarios === scenarios && memo.lib === lib && memo.loc === loc) return memo.out;
    const out = new Map<string, ScenarioTotals>();
    for (const s of scenarios) {
      const c = perScenario.get(s);
      if (c && c.lib === lib && c.loc === loc) out.set(s.id, c.t);
      else {
        const t = scenarioTotals(s, lib, scenarioLocation(s, loc));
        perScenario.set(s, { lib, loc, t });
        out.set(s.id, t);
      }
    }
    memo = { scenarios, lib, loc, out };
    return out;
  }, [scenarios, lib, loc]);
}

/** Scroll into view + focus/select an input once, when the store asks for it. */
export function scrollAndFocus(el: HTMLElement | null, input?: HTMLInputElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  el.classList.remove('just-created');
  void el.offsetWidth;
  el.classList.add('just-created');
  if (input) {
    input.focus({ preventScroll: true });
    input.select();
  }
}
