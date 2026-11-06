import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtUnit, hoursFmt, money, pct, type ScenarioTotals } from '../calc';
import { MIN_COLUMNS, useStore } from '../store';
import { countryOf, flagId, regionName } from '../tax/regions';
import { KINDS, KIND_META, PERIODS, type Scenario } from '../types';
import { EdiAmount, EdiPerHour } from './Edi';
import { Flag, ScenarioTitle } from './Flag';
import { DRAG_SCENARIO, DRAG_SLOT, useAllTotals } from './hooks';
import { Icon, cycle } from './ui';

type Metric = { key: string; label: string; get: (t: ScenarioTotals) => number; unit: '$' | 'h' };
const METRICS: Metric[] = [
  { key: 'net', label: 'Net income', get: (t) => t.netIncome, unit: '$' },
  { key: 'exp', label: 'Expenses', get: (t) => t.expenses, unit: '$' },
  { key: 'edi', label: 'EDI', get: (t) => t.edi, unit: '$' },
  { key: 'hrs', label: 'Hours', get: (t) => t.hours, unit: 'h' },
];

const endDrag = () => document.body.classList.remove('dragging-scenario', 'dragging-slot');

export function Analysis({ mobile = false }: { mobile?: boolean }) {
  const scenarios = useStore((s) => s.scenarios);
  const slots = useStore((s) => s.analysis.slots);
  const { insertOnStage, clearSlot, swapSlots } = useStore.getState();
  const totals = useAllTotals();
  const [poolHover, setPoolHover] = useState(false);
  const [stageHover, setStageHover] = useState(false);

  const byId = useMemo(() => new Map(scenarios.map((s) => [s.id, s])), [scenarios]);
  const shown = slots.filter((id) => byId.has(id));
  const shownKey = shown.join('|');
  const pool = scenarios.filter((s) => !shown.includes(s.id));
  // Never fewer than MIN_COLUMNS columns; empty spots fill the rest.
  const count = Math.max(MIN_COLUMNS, shown.length);
  const cells = Array.from({ length: count }, (_, i) => shown[i] ?? null);

  const { ranks, maxes } = useMemo(() => {
    const sorted = [...shown].sort((a, b) => (totals.get(b)!.ediPerHour ?? -Infinity) - (totals.get(a)!.ediPerHour ?? -Infinity));
    const ts = shown.map((id) => totals.get(id)!);
    const m: Record<string, number> = {};
    for (const met of METRICS) m[met.key] = Math.max(1e-9, ...ts.map((t) => Math.abs(met.get(t))));
    m.eph = Math.max(1e-9, ...ts.map((t) => Math.abs(t.ediPerHour ?? 0)));
    return { ranks: new Map(sorted.map((id, i) => [id, i + 1])), maxes: m };
    // shownKey stands in for `shown`, which is a new array each render
  }, [shownKey, totals]);

  return (
    <div className="analysis">
      <div
        className={'stage' + (stageHover ? ' is-hover' : '')}
        style={mobile ? undefined : { gridTemplateColumns: `repeat(${count}, minmax(250px, 1fr))` }}
        // Dropping a scenario anywhere else on the stage adds it as a new column at the end.
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_SCENARIO)) return;
          e.preventDefault();
          setStageHover(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setStageHover(false)}
        onDrop={(e) => {
          setStageHover(false);
          const sid = e.dataTransfer.getData(DRAG_SCENARIO);
          if (sid) {
            e.preventDefault();
            insertOnStage(shown.length, sid);
          }
        }}
      >
        {cells.map((id, slot) => {
          const sc = id ? byId.get(id) : undefined;
          return (
            <Slot
              key={id ?? 'empty' + slot}
              slot={slot}
              filled={!!sc}
              // Onto a column: insert there (stage grows); onto an empty spot: fill the next spot.
              onDropScenario={(sid) => insertOnStage(sc ? slot : shown.length, sid)}
              onDropSlot={(from) => (sc ? swapSlots(from, slot) : insertOnStage(shown.length, shown[from]))}
              onDragActive={() => setStageHover(false)}
            >
              {sc ? (
                <Column
                  slot={slot}
                  scenario={sc}
                  totals={totals.get(sc.id)!}
                  rank={ranks.get(sc.id)!}
                  maxes={maxes}
                  mobile={mobile}
                  canLeft={slot > 0}
                  canRight={slot < shown.length - 1}
                  onMove={(dir) => swapSlots(slot, slot + dir)}
                />
              ) : (
                <div className="empty-slot-inner">
                  <Icon name="plus" size={22} />
                  <p>{mobile ? 'Tap a pool scenario to add it' : 'Drag a scenario here'}</p>
                </div>
              )}
            </Slot>
          );
        })}
      </div>

      <section
        className={'pool glass cycle drop-target' + (poolHover ? ' is-hover' : '')}
        style={cycle('pool', 220, 520)}
        aria-label="Scenario pool"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_SLOT)) return;
          e.preventDefault();
          setPoolHover(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setPoolHover(false)}
        onDrop={(e) => {
          setPoolHover(false);
          const from = e.dataTransfer.getData(DRAG_SLOT);
          if (from !== '') clearSlot(Number(from));
        }}
      >
        <h3>Pool <span className="count">{pool.length}</span></h3>
        {pool.length === 0 ? (
          <p className="muted small">All scenarios are on stage.</p>
        ) : (
          <div className="pool-items">
            {pool.map((s) => {
              const t = totals.get(s.id)!;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="pool-chip cycle"
                  style={cycle(s.id + ':pool', 150, 380)}
                  draggable={!mobile}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_SCENARIO, s.id);
                    e.dataTransfer.effectAllowed = 'copyMove';
                    document.body.classList.add('dragging-scenario');
                  }}
                  onDragEnd={endDrag}
                  onClick={() => insertOnStage(shown.length, s.id)}
                  title={mobile ? 'Tap to add to the stage' : 'Click to add as a column, or drag onto the stage'}
                >
                  <span className="tab-name"><ScenarioTitle scenario={s} /></span>
                  <span className={'tab-metric' + ((t.ediPerHour ?? 0) < 0 ? ' neg' : '')}><EdiPerHour t={t} /><small>/h</small></span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Slot({
  slot, filled, onDropScenario, onDropSlot, onDragActive, children,
}: {
  slot: number;
  filled: boolean;
  onDropScenario: (id: string) => void;
  onDropSlot: (from: number) => void;
  onDragActive: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState<'' | 'insert' | 'swap' | 'fill'>('');
  return (
    <div
      className={'slot drop-target' + (filled ? '' : ' slot--empty') + (hover ? ' is-hover is-' + hover : '')}
      onDragOver={(e) => {
        const t = e.dataTransfer.types;
        const kind = t.includes(DRAG_SCENARIO) ? (filled ? 'insert' : 'fill') : t.includes(DRAG_SLOT) ? (filled ? 'swap' : 'fill') : '';
        if (!kind) return;
        e.preventDefault();
        e.stopPropagation();
        onDragActive();
        if (hover !== kind) setHover(kind);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHover('')}
      onDrop={(e) => {
        setHover('');
        const sid = e.dataTransfer.getData(DRAG_SCENARIO);
        const from = e.dataTransfer.getData(DRAG_SLOT);
        if (sid) { e.preventDefault(); e.stopPropagation(); onDropScenario(sid); }
        else if (from !== '' && Number(from) !== slot) { e.preventDefault(); e.stopPropagation(); onDropSlot(Number(from)); }
      }}
    >
      {children}
      {hover === 'insert' && <span className="drop-label">Add as a new column here</span>}
      {hover === 'swap' && <span className="drop-label">Swap columns</span>}
    </div>
  );
}

const Column = memo(function Column(props: {
  slot: number;
  scenario: Scenario;
  totals: ScenarioTotals;
  rank: number;
  maxes: Record<string, number>;
  mobile: boolean;
  canLeft: boolean;
  canRight: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const { scenario: sc, totals: t } = props;
  const period = useStore((s) => s.period);
  const { setActive, setView, clearSlot } = useStore.getState();
  const pm = PERIODS.find((p) => p.id === period)!;
  const per = (n: number) => n / pm.perYear;
  const [dragging, setDragging] = useState(false);
  const groups = KINDS.map((k) => ({ kind: k, items: t.items.filter((i) => i.def.kind === k) }));
  const loc = t.location;

  return (
    <div
      className={'column glass cycle' + (props.rank === 1 ? ' is-top' : '') + (dragging ? ' is-dragging' : '')}
      style={cycle(sc.id + ':col', 160, 420)}
      draggable={!props.mobile}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_SLOT, String(props.slot));
        e.dataTransfer.effectAllowed = 'move';
        const r = e.currentTarget.getBoundingClientRect();
        e.dataTransfer.setDragImage(e.currentTarget, e.clientX - r.left, e.clientY - r.top);
        document.body.classList.add('dragging-slot');
        setDragging(true);
      }}
      onDragEnd={() => {
        endDrag();
        setDragging(false);
      }}
      title="Drag onto another column to swap, or onto the pool / top rack to take it off stage"
    >
      <header className="col-head">
        <span className="col-grip" aria-hidden="true"><Icon name="grip" size={14} /></span>
        <span className={'rank rank--' + props.rank}>#{props.rank}</span>
        <FitTitle><ScenarioTitle scenario={sc} /></FitTitle>
        <div className="col-tools">
          {props.mobile && (
            <>
              <button type="button" className="tool" disabled={!props.canLeft} onClick={() => props.onMove(-1)} aria-label="Move left" title="Move left">◀</button>
              <button type="button" className="tool" disabled={!props.canRight} onClick={() => props.onMove(1)} aria-label="Move right" title="Move right">▶</button>
            </>
          )}
          <button type="button" className="tool" onClick={() => { setActive(sc.id); setView('build'); }} title="Edit in builder" aria-label="Edit scenario"><Icon name="back" size={14} /></button>
          <button type="button" className="tool tool--danger" onClick={() => clearSlot(props.slot)} title="Send to pool" aria-label="Send to pool"><Icon name="x" size={14} /></button>
        </div>
      </header>

      <div className="col-hero">
        <div className="hero-pair">
          <div className="hero-fig">
            <span className="big-label">EDI / hour</span>
            <span className={'hero-value' + ((t.ediPerHour ?? 0) < 0 || t.overHours ? ' neg' : '')}><EdiPerHour t={t} /></span>
          </div>
          <div className="hero-fig hero-fig--total">
            <span className="big-label">Total EDI <small>/{pm.short}</small></span>
            <span className={'hero-total' + (t.edi < 0 ? ' neg' : '')}><EdiAmount value={per(t.edi)} whole /></span>
          </div>
        </div>
        <Bar value={t.ediPerHour ?? 0} max={props.maxes.eph} />
      </div>

      <div className="col-metrics">
        {METRICS.map((m) => {
          const v = m.get(t);
          return (
            <div key={m.key} className="metric">
              <div className="metric-row">
                <span>{m.label} <small>/{pm.short}</small></span>
                <b className={v < 0 ? 'neg' : ''}>{fmtUnit(per(v), m.unit)}</b>
              </div>
              <Bar value={v} max={props.maxes[m.key]} kind={m.key} />
            </div>
          );
        })}
        <div className="metric-row small muted">
          <span className="tax-where">
            <Flag id={flagId(loc.country)} title={countryOf(loc.country).name} />
            <Flag id={flagId(loc.country, loc.region)} title={regionName(loc.country, loc.region)} /> Tax · {regionName(loc.country, loc.region)} · {pct(t.taxDetail.effectiveRate)} eff.
          </span>
          <span>{money(-per(t.tax), true)}</span>
        </div>
      </div>

      <div className="col-breakdown">
        {groups.map((g) => (
          <div key={g.kind} className={`bd bd--${g.kind}`}>
            <h4><span className={`kind-dot kind-dot--${g.kind}`} />{KIND_META[g.kind].plural}</h4>
            {g.items.length === 0 ? (
              <p className="muted small">None</p>
            ) : (
              <ul>
                {g.items.map((i) => (
                  <li key={i.card.id} className={i.error ? 'is-error' : ''}>
                    <span>
                      {i.def.name}
                      {!i.card.linked && <em title="Unlinked / customised"> ✎</em>}
                      {g.kind === 'income' && !i.def.taxable && <em title="Non-taxable"> NT</em>}
                    </span>
                    <span>{KIND_META[g.kind].unit === 'h' ? hoursFmt(per(i.annual)) : money(per(i.annual))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

const FIT_MAX = 16;
/** Smallest size for a single-line title; below this the tag moves to its own line. */
const FIT_ONE_LINE_MIN = 12.5;
/** Smallest size for the name when it has a line to itself (then it ellipsises). */
const FIT_NAME_MIN = 12;
/** Location tag size when it sits on its own line — always fully shown. */
const TAG_OWN_LINE = 12.5;
const TAG_MIN = 10.5;

/**
 * Column title sized to fit. One line (name + location tag scaled together) when that
 * stays readable; otherwise the name gets the first line, sized to fit, and the location
 * tag takes a second line at a fixed legible size. The tag is never truncated.
 */
function FitTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const name = el.querySelector<HTMLElement>('.title-text');
      const tag = el.querySelector<HTMLElement>('.loc-suffix');
      el.classList.remove('is-two-line', 'tag-wraps');
      el.style.fontSize = FIT_MAX + 'px';
      if (tag) tag.style.fontSize = '';
      const avail = el.clientWidth;
      if (!avail || !name) return;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const nameW = name.scrollWidth;
      // ~4% headroom: text width doesn't scale perfectly linearly with font size.
      const oneLine = (FIT_MAX * avail) / ((nameW + (tag ? tag.scrollWidth + gap : 0)) * 1.04 + 2);
      if (oneLine >= FIT_ONE_LINE_MIN || !tag) {
        el.style.fontSize = Math.max(FIT_NAME_MIN, Math.min(FIT_MAX, oneLine)).toFixed(2) + 'px';
        return;
      }
      // Two-line mode: the title drops below the rank/buttons row and gets the full width.
      el.classList.add('is-two-line');
      const wide = el.clientWidth || avail;
      el.style.fontSize = Math.max(FIT_NAME_MIN, Math.min(FIT_MAX, FIT_MAX * wide / (nameW + 1))).toFixed(2) + 'px';
      tag.style.fontSize = TAG_OWN_LINE + 'px';
      const tagW = tag.scrollWidth;
      if (tagW > wide) tag.style.fontSize = Math.max(TAG_MIN, (TAG_OWN_LINE * wide) / (tagW + 1)).toFixed(2) + 'px';
      // Still too wide at the minimum: the tag wraps between nation and province (CSS).
      el.classList.toggle('tag-wraps', tag.scrollWidth > wide + 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  });
  return (
    <h3 ref={ref} className="fit-title">
      {children}
    </h3>
  );
}

function Bar({ value, max, kind }: { value: number; max: number; kind?: string }) {
  const w = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className={'bar' + (kind ? ' bar--' + kind : '') + (value < 0 ? ' bar--neg' : '')}>
      <span style={{ transform: `scaleX(${w / 100})` }} />
    </div>
  );
}
