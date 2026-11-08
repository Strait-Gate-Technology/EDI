import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { create } from 'zustand';
import { useStore } from '../store';
import {
  describePoi, poiDays, poiDetail, resolvePoi, todayIso, validLength,
  type PeriodOfInterest, type PoiLengthUnit, type PoiStartUnit, type Scenario,
} from '../types';
import { Icon } from './ui';

/** Which scenario's picker is open (so "Set period" links elsewhere can open it). */
const usePoiOpen = create<{ id: string | null; nonce: number }>(() => ({ id: null, nonce: 0 }));
export const openPeriodPicker = (id: string) => usePoiOpen.setState((s) => ({ id, nonce: s.nonce + 1 }));
const closePicker = () => usePoiOpen.setState({ id: null });

const START_UNITS: { id: PoiStartUnit; label: string }[] = [
  { id: 'year', label: 'Year' },
  { id: 'month', label: 'Month' },
  { id: 'day', label: 'Day' },
];
const LENGTH_UNITS: PoiLengthUnit[] = ['days', 'weeks', 'months', 'years'];
const defaultLength = (u: PoiStartUnit) => (u === 'year' ? { n: 1, unit: 'years' as const } : { n: 1, unit: 'months' as const });

function quickPicks(): { label: string; spec: PeriodOfInterest }[] {
  const today = todayIso();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const picks: { label: string; spec: PeriodOfInterest }[] = [
    { label: 'This year', spec: { start: `${y}-01-01`, startUnit: 'year', length: { n: 1, unit: 'years' } } },
    { label: 'Next year', spec: { start: `${y + 1}-01-01`, startUnit: 'year', length: { n: 1, unit: 'years' } } },
    { label: 'Next 12 months', spec: { start: next, startUnit: 'month', length: { n: 12, unit: 'months' } } },
  ];
  if (today < `${y}-12-31`) picks.push({ label: 'Rest of this year', spec: { start: today, startUnit: 'day', end: `${y}-12-31` } });
  return picks;
}

/**
 * Period of Interest, collapsed to one pill ("2026 · 4 months"). The popover starts coarse
 * (a year + a duration) and offers month / exact-day precision and an explicit end only on demand.
 */
export function PeriodPicker({ scenario, needed }: { scenario: Scenario; needed: boolean }) {
  const update = useStore((s) => s.updateScenario);
  const openId = usePoiOpen((s) => s.id);
  const nonce = usePoiOpen((s) => s.nonce);
  const open = openId === scenario.id;
  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLInputElement>(null);

  const poi = scenario.poi;
  const days = poiDays(poi);
  const bad = !!poi?.start && days == null;
  const label = describePoi(poi);

  const write = (spec: PeriodOfInterest | undefined) =>
    update(scenario.id, (s) => {
      s.poi = spec ? resolvePoi(spec) : undefined;
    });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && closePicker();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closePicker();
      ref.current?.querySelector<HTMLElement>('.poi-pill')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Opening (by click or a "Set period" link) puts the cursor in the Starting input.
  useEffect(() => {
    if (open) requestAnimationFrame(() => startRef.current?.focus({ preventScroll: true }));
  }, [open, nonce]);

  // Close when this scenario's editor unmounts.
  useEffect(() => () => { if (usePoiOpen.getState().id === scenario.id) closePicker(); }, [scenario.id]);

  const tip = bad
    ? poi?.length ? 'Set a length of at least 1' : 'End must be after Start'
    : days
      ? `Period of Interest: ${poiDetail(poi)}. One-time cards are spread over it.`
      : 'Optional. Set a period to make this scenario time-aware: one-time cards are counted over it, and Total EDI is also shown for the whole span.';

  return (
    <div className={'menu-wrap poi-picker' + (open ? ' is-open' : '')} ref={ref} data-poi={scenario.id}>
      <button
        type="button"
        className={'flag-pill poi-pill' + (open ? ' is-open' : '') + (bad || (needed && !days) ? ' is-bad' : '') + (label ? '' : ' is-empty')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={tip}
        onClick={() => (open ? closePicker() : openPeriodPicker(scenario.id))}
      >
        {needed && !days ? <span aria-hidden="true">⚠</span> : <Icon name="calendar" size={13} />}
        <span className="poi-pill-label">{label ? label : <>Period<span className="poi-pill-sub">: not set</span></>}</span>
        <Icon name="down" size={11} />
      </button>
      {open && <PeriodPopover poi={poi} write={write} startRef={startRef} days={days} bad={bad} anchor={ref} />}
    </div>
  );
}

function PeriodPopover({
  poi, write, startRef, days, bad, anchor,
}: {
  poi: PeriodOfInterest | undefined;
  write: (spec: PeriodOfInterest | undefined) => void;
  startRef: RefObject<HTMLInputElement | null>;
  days: number | null;
  bad: boolean;
  anchor: RefObject<HTMLDivElement | null>;
}) {
  // Keep the popover on screen: shift it left when the pill sits near the right edge.
  const popRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const w = popRef.current?.offsetWidth ?? 0;
      if (!a) return;
      // The scenario card clips overflow, so stay inside it (and the window).
      const box = anchor.current?.closest('.scenario-card')?.getBoundingClientRect();
      const lo = Math.max(8, (box?.left ?? 0) + 8);
      const hi = Math.min(window.innerWidth, box?.right ?? Infinity) - 8;
      const left = Math.max(lo, Math.min(a.left, hi - w));
      setShift(Math.round(left - a.left));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  const unit: PoiStartUnit = poi?.startUnit ?? (poi?.start ? 'day' : 'year');
  const mode: 'duration' | 'until' = poi?.start && !poi.length ? 'until' : 'duration';
  const length = poi?.length ?? defaultLength(unit);
  const today = todayIso();

  // Drafts let a half-typed year / number sit in the input without being written.
  const [yearDraft, setYearDraft] = useState(poi?.start?.slice(0, 4) ?? '');
  const [nDraft, setNDraft] = useState(String(length.n));
  useEffect(() => setYearDraft(poi?.start?.slice(0, 4) ?? ''), [poi?.start]);
  useEffect(() => setNDraft(String(poi?.length?.n ?? defaultLength(unit).n)), [poi?.length?.n, unit]);

  /** Update the spec; a first edit fills in the defaults (this year, 1 year / 1 month). */
  const patch = (p: Partial<PeriodOfInterest>) => {
    const base: PeriodOfInterest = poi?.start
      ? { ...poi, startUnit: unit }
      : { start: unit === 'year' ? today.slice(0, 4) + '-01-01' : unit === 'month' ? today.slice(0, 7) + '-01' : today, startUnit: unit, length: defaultLength(unit) };
    write({ ...base, ...p });
  };

  const setUnit = (u: PoiStartUnit) => {
    if (u === unit && poi?.start) return;
    const start = poi?.start ?? today;
    const snapped = u === 'year' ? start.slice(0, 4) + '-01-01' : u === 'month' ? start.slice(0, 7) + '-01' : start;
    // A brand-new period gets a sensible length for its precision.
    patch({ start: snapped, startUnit: u, ...(poi?.start ? {} : { length: defaultLength(u) }) });
    requestAnimationFrame(() => startRef.current?.focus({ preventScroll: true }));
  };

  const setMode = (m: 'duration' | 'until') => {
    if (m === mode) return;
    if (m === 'until') patch({ length: undefined, end: poi?.end && days ? poi.end : undefined });
    else patch({ length: defaultLength(unit) });
  };

  return (
    <div ref={popRef} className="menu menu--left poi-pop" role="dialog" aria-label="Period of Interest" style={{ left: shift }}>
      <div className="poi-quick" role="group" aria-label="Quick picks">
        {quickPicks().map((q) => (
          <button key={q.label} type="button" className="poi-chip" onClick={() => write(q.spec)}>
            {q.label}
          </button>
        ))}
      </div>

      <div className="poi-row">
        <span className="poi-row-label">Starting</span>
        <div className="segmented poi-seg" role="group" aria-label="Start precision">
          {START_UNITS.map((u) => (
            <button key={u.id} type="button" className={unit === u.id ? 'is-on' : ''} aria-pressed={unit === u.id} onClick={() => setUnit(u.id)}>
              {u.label}
            </button>
          ))}
        </div>
        {unit === 'year' ? (
          <input
            ref={startRef}
            type="number"
            inputMode="numeric"
            className="glass-select poi-year"
            min={1900}
            max={2200}
            placeholder={today.slice(0, 4)}
            value={yearDraft}
            aria-label="Start year"
            onChange={(e) => {
              setYearDraft(e.target.value);
              const y = Number(e.target.value);
              if (/^\d{4}$/.test(e.target.value) && y >= 1900 && y <= 2200) patch({ start: `${y}-01-01` });
            }}
          />
        ) : unit === 'month' ? (
          <input
            ref={startRef}
            type="month"
            className="glass-select date-input"
            value={poi?.start?.slice(0, 7) ?? ''}
            aria-label="Start month"
            onChange={(e) => e.target.value && patch({ start: e.target.value + '-01' })}
          />
        ) : (
          <input
            ref={startRef}
            type="date"
            className="glass-select date-input"
            value={poi?.start ?? ''}
            aria-label="Start date"
            onChange={(e) => e.target.value && patch({ start: e.target.value })}
          />
        )}
      </div>

      <div className="poi-row">
        <span className="poi-row-label">For</span>
        <div className="segmented poi-seg" role="group" aria-label="Period length">
          <button type="button" className={mode === 'duration' ? 'is-on' : ''} aria-pressed={mode === 'duration'} onClick={() => setMode('duration')}>
            Duration
          </button>
          <button type="button" className={mode === 'until' ? 'is-on' : ''} aria-pressed={mode === 'until'} onClick={() => setMode('until')}>
            Until date
          </button>
        </div>
        {mode === 'duration' ? (
          <span className="poi-duration">
            <input
              type="number"
              inputMode="numeric"
              className={'glass-select poi-n' + (poi?.length && !validLength(poi.length) ? ' is-bad' : '')}
              min={1}
              step={1}
              value={nDraft}
              aria-label="Duration"
              onChange={(e) => {
                setNDraft(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== '') patch({ length: { n, unit: length.unit } });
              }}
            />
            <select
              className="glass-select poi-unit"
              value={length.unit}
              aria-label="Duration unit"
              onChange={(e) => patch({ length: { n: length.n, unit: e.target.value as PoiLengthUnit } })}
            >
              {LENGTH_UNITS.map((u) => (
                <option key={u} value={u}>{length.n === 1 ? u.slice(0, -1) : u}</option>
              ))}
            </select>
          </span>
        ) : (
          <input
            type="date"
            className={'glass-select date-input' + (bad ? ' is-bad' : '')}
            value={poi?.end ?? ''}
            min={poi?.start}
            aria-label="End date (inclusive)"
            onChange={(e) => patch({ end: e.target.value || undefined, length: undefined })}
          />
        )}
      </div>

      <div className="poi-foot">
        <span className={'poi-resolved' + (bad ? ' neg' : '')}>
          {bad ? (poi?.length ? 'Set a length of at least 1' : poi?.end ? 'End must be after Start' : 'Pick an end date') : days ? `${poiDetail(poi).replace(/ \((\d+) days\)$/, ' · $1 days')}` : 'Optional: pick a quick option or a start'}
        </span>
        {poi && (
          <button type="button" className="link-btn poi-clear" onClick={() => write(undefined)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
