import { memo, useMemo, useState, type DragEvent } from 'react';
import { fmtUnit, hoursFmt, money, pct, type ScenarioTotals } from '../calc';
import { useStore } from '../store';
import { regionName } from '../tax/regions';
import { KINDS, KIND_META, PERIODS, type Scenario } from '../types';
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

export function Analysis() {
  const scenarios = useStore((s) => s.scenarios);
  const { columns, slots } = useStore((s) => s.analysis);
  const { setColumns, placeInSlot, clearSlot, swapSlots } = useStore.getState();
  const totals = useAllTotals();
  const [poolHover, setPoolHover] = useState(false);

  const byId = useMemo(() => new Map(scenarios.map((s) => [s.id, s])), [scenarios]);
  const shown = slots.map((id) => (id && byId.has(id) ? id : null));
  const shownKey = shown.join('|');
  const pool = scenarios.filter((s) => !shown.includes(s.id));

  const { ranks, maxes } = useMemo(() => {
    const vis = shown.filter((x): x is string => !!x);
    const sorted = [...vis].sort((a, b) => (totals.get(b)!.ediPerHour ?? -Infinity) - (totals.get(a)!.ediPerHour ?? -Infinity));
    const ts = vis.map((id) => totals.get(id)!);
    const m: Record<string, number> = {};
    for (const met of METRICS) m[met.key] = Math.max(1e-9, ...ts.map((t) => Math.abs(met.get(t))));
    m.eph = Math.max(1e-9, ...ts.map((t) => Math.abs(t.ediPerHour ?? 0)));
    return { ranks: new Map(sorted.map((id, i) => [id, i + 1])), maxes: m };
  }, [shownKey, totals]);

  const firstEmpty = shown.findIndex((x) => !x);

  return (
    <div className="analysis">
      <div className="analysis-bar glass cycle" style={cycle('analysis-bar', 240, 500)}>
        <div>
          <h2>Analysis</h2>
          <p className="muted">
            Drag a column onto another to swap, onto the pool or the top rack to take it off stage. Drag scenarios from the top rack or the pool into a column.
          </p>
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
          return (
            <Slot key={slot} slot={slot} onDropScenario={(sid) => placeInSlot(slot, sid)} onDropSlot={(from) => swapSlots(from, slot)} filled={!!sc}>
              {sc ? (
                <Column
                  slot={slot}
                  scenario={sc}
                  totals={totals.get(sc.id)!}
                  rank={ranks.get(sc.id)!}
                  maxes={maxes}
                />
              ) : (
                <div className="empty-slot-inner">
                  <Icon name="plus" size={22} />
                  <p>Drag a scenario here</p>
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
          <p className="muted small">All scenarios are on stage. Drag a column here to free it.</p>
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
                    e.dataTransfer.effectAllowed = 'copyMove';
                    document.body.classList.add('dragging-scenario');
                  }}
                  onDragEnd={endDrag}
                  onClick={() => placeInSlot(firstEmpty >= 0 ? firstEmpty : columns - 1, s.id)}
                  title={firstEmpty >= 0 ? 'Click or drag onto the stage' : 'Drag onto a column to replace it (click replaces the last column)'}
                >
                  <span className="tab-name"><ScenarioTitle scenario={s} /></span>
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

function Slot({
  slot, filled, onDropScenario, onDropSlot, children,
}: {
  slot: number;
  filled: boolean;
  onDropScenario: (id: string) => void;
  onDropSlot: (from: number) => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_SCENARIO) || e.dataTransfer.types.includes(DRAG_SLOT);
  return (
    <div
      className={'slot drop-target' + (filled ? '' : ' slot--empty') + (hover ? ' is-hover' : '')}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHover(false)}
      onDrop={(e) => {
        setHover(false);
        const sid = e.dataTransfer.getData(DRAG_SCENARIO);
        const from = e.dataTransfer.getData(DRAG_SLOT);
        if (sid) { e.preventDefault(); onDropScenario(sid); }
        else if (from !== '' && Number(from) !== slot) { e.preventDefault(); onDropSlot(Number(from)); }
      }}
    >
      {children}
    </div>
  );
}

const Column = memo(function Column(props: {
  slot: number;
  scenario: Scenario;
  totals: ScenarioTotals;
  rank: number;
  maxes: Record<string, number>;
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
      draggable
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
        <h3><ScenarioTitle scenario={sc} /></h3>
        <div className="col-tools">
          <button type="button" className="tool" onClick={() => { setActive(sc.id); setView('build'); }} title="Edit in builder" aria-label="Edit scenario"><Icon name="back" size={14} /></button>
          <button type="button" className="tool tool--danger" onClick={() => clearSlot(props.slot)} title="Send to pool" aria-label="Send to pool"><Icon name="x" size={14} /></button>
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
          <span className="tax-where">
            <Flag id={`${loc.country}-${loc.region}`} /> Tax · {regionName(loc.country, loc.region)} · {pct(t.taxDetail.effectiveRate)} eff.
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

function Bar({ value, max, kind }: { value: number; max: number; kind?: string }) {
  const w = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className={'bar' + (kind ? ' bar--' + kind : '') + (value < 0 ? ' bar--neg' : '')}>
      <span style={{ transform: `scaleX(${w / 100})` }} />
    </div>
  );
}
