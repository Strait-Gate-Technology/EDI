import { useMemo, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from 'react';
import { fmtUnit, hoursFmt, money, scenarioTotals, type ScenarioTotals } from '../calc';
import { useStore } from '../store';
import { KINDS, KIND_META, PERIODS, type Scenario } from '../types';
import { useLibraryMap } from './ScenarioPanel';
import { Icon, cycle } from './ui';

const DRAG_SCENARIO = 'application/x-edi-scenario';
const DRAG_SLOT = 'application/x-edi-slot';
const SWIPE_OUT = 130;

type Metric = { key: string; label: string; get: (t: ScenarioTotals) => number; unit: '$' | 'h'; better: 'high' | 'low' };
const METRICS: Metric[] = [
  { key: 'net', label: 'Net income', get: (t) => t.netIncome, unit: '$', better: 'high' },
  { key: 'exp', label: 'Expenses', get: (t) => t.expenses, unit: '$', better: 'low' },
  { key: 'edi', label: 'EDI', get: (t) => t.edi, unit: '$', better: 'high' },
  { key: 'hrs', label: 'Hours', get: (t) => t.hours, unit: 'h', better: 'low' },
];

export function Analysis() {
  const scenarios = useStore((s) => s.scenarios);
  const { columns, slots } = useStore((s) => s.analysis);
  const { setColumns, placeInSlot, clearSlot, swapSlots, setActive, setView } = useStore.getState();
  const lib = useLibraryMap();
  const [poolHover, setPoolHover] = useState(false);

  const totals = useMemo(() => new Map(scenarios.map((s) => [s.id, scenarioTotals(s, lib)])), [scenarios, lib]);
  const byId = useMemo(() => new Map(scenarios.map((s) => [s.id, s])), [scenarios]);

  const shown = slots.map((id) => (id && byId.has(id) ? id : null));
  const pool = scenarios.filter((s) => !shown.includes(s.id));

  // Rank visible scenarios by EDI / hour.
  const ranks = useMemo(() => {
    const vis = shown.filter((x): x is string => !!x);
    const sorted = [...vis].sort((a, b) => (totals.get(b)!.ediPerHour ?? -Infinity) - (totals.get(a)!.ediPerHour ?? -Infinity));
    return new Map(sorted.map((id, i) => [id, i + 1]));
  }, [shown.join('|'), totals]);

  // Scale for comparison bars.
  const maxes = useMemo(() => {
    const vis = shown.filter((x): x is string => !!x).map((id) => totals.get(id)!);
    const m: Record<string, number> = {};
    for (const met of METRICS) m[met.key] = Math.max(1e-9, ...vis.map((t) => Math.abs(met.get(t))));
    m.eph = Math.max(1e-9, ...vis.map((t) => Math.abs(t.ediPerHour ?? 0)));
    return m;
  }, [shown.join('|'), totals]);

  const firstEmpty = shown.findIndex((x) => !x);

  return (
    <div className="analysis">
      <div className="analysis-bar glass cycle" style={cycle('analysis-bar', 240, 500)}>
        <div>
          <h2>Analysis</h2>
          <p className="muted">Swipe a column sideways to send it back to the pool · drag scenarios in from the pool · drag a column's title onto another to swap.</p>
        </div>
        <div className="col-stepper" role="group" aria-label="Number of columns">
          <button type="button" className="glass-btn icon-btn" onClick={() => setColumns(columns - 1)} disabled={columns <= 1} aria-label="Fewer columns">−</button>
          <span><b>{columns}</b> columns</span>
          <button type="button" className="glass-btn icon-btn" onClick={() => setColumns(columns + 1)} disabled={columns >= 6} aria-label="More columns">+</button>
        </div>
      </div>

      <div className="stage" style={{ gridTemplateColumns: `repeat(${columns}, minmax(250px, 1fr))` }}>
        {shown.map((id, slot) => {
          const sc = id ? byId.get(id) : undefined;
          return sc ? (
            <Column
              key={sc.id}
              slot={slot}
              scenario={sc}
              totals={totals.get(sc.id)!}
              rank={ranks.get(sc.id)!}
              maxes={maxes}
              onDismiss={() => clearSlot(slot)}
              onDropScenario={(sid) => placeInSlot(slot, sid)}
              onDropSlot={(from) => swapSlots(from, slot)}
              onEdit={() => { setActive(sc.id); setView('build'); }}
            />
          ) : (
            <EmptySlot key={'empty' + slot} slot={slot} onDropScenario={(sid) => placeInSlot(slot, sid)} onDropSlot={(from) => swapSlots(from, slot)} />
          );
        })}
      </div>

      <section
        className={'pool glass cycle' + (poolHover ? ' is-hover' : '')}
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
          <p className="muted small">All scenarios are on stage. Swipe one away to free a column.</p>
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
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_SCENARIO, s.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => placeInSlot(firstEmpty >= 0 ? firstEmpty : columns - 1, s.id)}
                  title={firstEmpty >= 0 ? 'Click or drag onto the stage' : 'Drag onto a column to replace it (click replaces the last column)'}
                >
                  <span className="tab-name">{s.name}</span>
                  <span className="tab-metric">{t.ediPerHour == null ? '—' : money(t.ediPerHour)}<small>/h</small></span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function useSlotDrop(onDropScenario: (id: string) => void, onDropSlot: (from: number) => void, slot: number) {
  const [hover, setHover] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_SCENARIO) || e.dataTransfer.types.includes(DRAG_SLOT);
  return {
    hover,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setHover(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false);
      },
      onDrop: (e: DragEvent) => {
        setHover(false);
        const sid = e.dataTransfer.getData(DRAG_SCENARIO);
        const from = e.dataTransfer.getData(DRAG_SLOT);
        if (sid) { e.preventDefault(); onDropScenario(sid); }
        else if (from !== '' && Number(from) !== slot) { e.preventDefault(); onDropSlot(Number(from)); }
      },
    },
  };
}

function EmptySlot({ slot, onDropScenario, onDropSlot }: { slot: number; onDropScenario: (id: string) => void; onDropSlot: (f: number) => void }) {
  const { hover, handlers } = useSlotDrop(onDropScenario, onDropSlot, slot);
  return (
    <div className={'column column--empty' + (hover ? ' is-hover' : '')} {...handlers}>
      <div className="empty-slot-inner">
        <Icon name="plus" size={22} />
        <p>Drag a scenario here</p>
      </div>
    </div>
  );
}

function Column(props: {
  slot: number;
  scenario: Scenario;
  totals: ScenarioTotals;
  rank: number;
  maxes: Record<string, number>;
  onDismiss: () => void;
  onDropScenario: (id: string) => void;
  onDropSlot: (from: number) => void;
  onEdit: () => void;
}) {
  const { scenario: sc, totals: t } = props;
  const period = useStore((s) => s.period);
  const pm = PERIODS.find((p) => p.id === period)!;
  const per = (n: number) => n / pm.perYear;
  const { hover, handlers } = useSlotDrop(props.onDropScenario, props.onDropSlot, props.slot);

  // Swipe-to-dismiss
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; locked: boolean | null } | null>(null);

  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, [draggable="true"], a, input')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: null };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (s.locked === null && Math.hypot(mx, my) > 8) {
      s.locked = Math.abs(mx) > Math.abs(my);
      if (s.locked) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      else start.current = null;
    }
    if (s.locked) setDx(mx);
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    if (!s?.locked) return;
    if (Math.abs(dx) > SWIPE_OUT) {
      setLeaving(Math.sign(dx));
      setTimeout(props.onDismiss, 260);
    } else setDx(0);
  };

  const offset = leaving ? leaving * window.innerWidth * 0.6 : dx;
  const style = {
    ...cycle(sc.id + ':col', 160, 420),
    transform: `translateX(${offset}px) rotate(${offset / 28}deg)`,
    opacity: leaving ? 0 : 1 - Math.min(0.6, Math.abs(dx) / 500),
    transition: start.current?.locked ? 'none' : undefined,
  };

  const groups = KINDS.map((k) => ({ kind: k, items: t.items.filter((i) => i.def.kind === k) }));

  return (
    <div
      className={'column glass cycle' + (hover ? ' is-hover' : '') + (Math.abs(dx) > SWIPE_OUT ? ' will-dismiss' : '') + (props.rank === 1 ? ' is-top' : '')}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      {...handlers}
    >
      <header
        className="col-head"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_SLOT, String(props.slot));
          e.dataTransfer.effectAllowed = 'move';
        }}
        title="Drag onto another column to swap, or onto the pool to remove"
      >
        <span className={'rank rank--' + props.rank}>#{props.rank}</span>
        <h3>{sc.name}</h3>
        <div className="col-tools">
          <button type="button" className="tool" onClick={props.onEdit} title="Edit in builder" aria-label="Edit scenario"><Icon name="back" size={14} /></button>
          <button type="button" className="tool tool--danger" onClick={() => { setLeaving(1); setTimeout(props.onDismiss, 260); }} title="Send to pool" aria-label="Send to pool"><Icon name="x" size={14} /></button>
        </div>
      </header>

      <div className="col-hero">
        <span className="big-label">EDI / hour</span>
        <span className={'hero-value' + ((t.ediPerHour ?? 0) < 0 ? ' neg' : '')}>{t.ediPerHour == null ? '—' : money(t.ediPerHour)}</span>
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
          <span>Tax {sc.taxRate}% on {money(per(t.taxableIncome), true)}</span>
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
}

function Bar({ value, max, kind }: { value: number; max: number; kind?: string }) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className={'bar' + (kind ? ' bar--' + kind : '') + (value < 0 ? ' bar--neg' : '')}>
      <span style={{ width: pct + '%' }} />
    </div>
  );
}
