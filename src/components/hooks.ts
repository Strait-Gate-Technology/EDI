import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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

/**
 * Phones and small touch tablets: narrow screens, or touch-only devices up to
 * small-tablet width. Re-evaluates on rotation / resize.
 */
const MOBILE_QUERY = '(max-width: 820px), (pointer: coarse) and (hover: none) and (max-width: 1100px)';

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const q = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return mobile;
}

/** Long-press (touch) → callback with the press position; returns pointer handlers. */
export function useLongPress(onLong: (x: number, y: number) => void, ms = 480) {
  const t = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);
  const cancel = () => {
    if (t.current) clearTimeout(t.current.timer);
  };
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'touch') return;
      cancel();
      const st = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => { st.fired = true; onLong(st.x, st.y); }, ms) };
      t.current = st;
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (t.current && Math.hypot(e.clientX - t.current.x, e.clientY - t.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    /** True if the last press became a long-press (use to swallow the click). */
    consumed: () => {
      const f = !!t.current?.fired;
      if (t.current) t.current.fired = false;
      return f;
    },
  };
}
