import { useMemo, useState, type DragEvent } from 'react';
import { effectiveDef, hoursFmt, money, scenarioTotals, type ScenarioTotals } from '../calc';
import { useStore } from '../store';
import { KINDS, KIND_META, PERIODS, type CardDef, type Kind, type Scenario } from '../types';
import { CardView } from './CardView';
import { DRAG_LIB } from './LibraryPanel';
import { Icon, cycle } from './ui';

export const DRAG_MOVE = (k: Kind) => `application/x-edi-move-${k}`;

export function useLibraryMap() {
  const library = useStore((s) => s.library);
  return useMemo(() => new Map<string, CardDef>(library.map((c) => [c.id, c])), [library]);
}

export function ScenarioPanel() {
  const scenarios = useStore((s) => s.scenarios);
  const activeId = useStore((s) => s.activeScenarioId);
  const addScenario = useStore((s) => s.addScenario);
  const scenario = scenarios.find((s) => s.id === activeId);

  return (
    <main className="workspace panel glass-dark cycle" style={cycle('workspace', 400, 720)} aria-label="Scenario editor">
      {scenario ? (
        <ScenarioEditor key={scenario.id} scenario={scenario} />
      ) : (
        <div className="empty-state">
          <div className="empty-orb cycle" style={cycle('empty-orb', 60, 120)} />
          <h2>No scenario selected</h2>
          <p className="muted">Create a scenario, then drag Income, Expense and Hours cards from the library into it.</p>
          <button type="button" className="glass-btn" onClick={addScenario}>
            <Icon name="plus" /> New Scenario
          </button>
        </div>
      )}
    </main>
  );
}

function ScenarioEditor({ scenario }: { scenario: Scenario }) {
  const lib = useLibraryMap();
  const update = useStore((s) => s.updateScenario);
  const dup = useStore((s) => s.duplicateScenario);
  const del = useStore((s) => s.deleteScenario);
  const totals = useMemo(() => scenarioTotals(scenario, lib), [scenario, lib]);

  return (
    <article className="scenario-card glass-dark cycle" style={cycle(scenario.id + ':scard', 200, 520)}>
      <header className="scenario-head">
        <input
          className="scenario-name"
          value={scenario.name}
          aria-label="Scenario name"
          spellCheck={false}
          onChange={(e) => update(scenario.id, (s) => { s.name = e.target.value; })}
        />
        <label className="tax-input" title="Effective tax rate applied to taxable incomes">
          Tax rate
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={scenario.taxRate}
            onChange={(e) => update(scenario.id, (s) => { s.taxRate = Math.max(0, Math.min(100, Number(e.target.value) || 0)); })}
          />
          %
        </label>
        <div className="scenario-tools">
          <button type="button" className="glass-btn icon-btn" title="Duplicate scenario" aria-label="Duplicate scenario" onClick={() => dup(scenario.id)}>
            <Icon name="copy" />
          </button>
          <button
            type="button"
            className="glass-btn icon-btn danger"
            title="Delete scenario"
            aria-label="Delete scenario"
            onClick={() => confirm(`Delete scenario "${scenario.name}"?`) && del(scenario.id)}
          >
            <Icon name="trash" />
          </button>
        </div>
      </header>

      <div className="zones">
        {KINDS.map((k) => (
          <Zone key={k} kind={k} scenario={scenario} lib={lib} />
        ))}
      </div>

      <TotalsFooter totals={totals} taxRate={scenario.taxRate} seed={scenario.id} />
    </article>
  );
}

function Zone({ kind, scenario, lib }: { kind: Kind; scenario: Scenario; lib: Map<string, CardDef> }) {
  const addCard = useStore((s) => s.addCardToScenario);
  const updateCard = useStore((s) => s.updateScenarioCard);
  const unlink = useStore((s) => s.unlinkScenarioCard);
  const remove = useStore((s) => s.removeScenarioCard);
  const move = useStore((s) => s.moveScenarioCard);
  const [state, setState] = useState<'idle' | 'accept' | 'reject'>('idle');

  const cards = scenario.cards.filter((c) => effectiveDef(c, lib).kind === kind);

  const classify = (e: DragEvent): 'accept' | 'reject' | null => {
    const types = e.dataTransfer.types;
    if (types.includes(DRAG_LIB(kind)) || types.includes(DRAG_MOVE(kind))) return 'accept';
    if (types.some((t) => t.startsWith('application/x-edi-lib-') || t.startsWith('application/x-edi-move-'))) return 'reject';
    return null;
  };

  return (
    <section
      className={`zone zone--${kind} zone--${state} cycle`}
      style={cycle(scenario.id + ':zone:' + kind, 180, 460)}
      aria-label={`${KIND_META[kind].plural} drop zone`}
      onDragOver={(e) => {
        const c = classify(e);
        if (!c) return;
        if (c === 'accept') {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_LIB(kind)) ? 'copy' : 'move';
        } else e.dataTransfer.dropEffect = 'none';
        setState(c);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setState('idle');
      }}
      onDrop={(e) => {
        setState('idle');
        const libId = e.dataTransfer.getData(DRAG_LIB(kind));
        const moveId = e.dataTransfer.getData(DRAG_MOVE(kind));
        if (libId) {
          e.preventDefault();
          addCard(scenario.id, libId);
        } else if (moveId) {
          e.preventDefault();
          move(scenario.id, moveId, null);
        }
      }}
    >
      <div className="zone-head">
        <h3>
          <span className={`kind-dot kind-dot--${kind}`} />
          {KIND_META[kind].plural}
        </h3>
        <span className="zone-hint">
          {state === 'reject' ? `Only ${KIND_META[kind].label.toLowerCase()} cards belong here` : state === 'accept' ? 'Drop to add' : `${cards.length} card${cards.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="zone-empty">Drag {KIND_META[kind].label.toLowerCase()} cards here</div>
      ) : (
        <div className="zone-cards">
          {cards.map((c) => {
            const def = effectiveDef(c, lib);
            const parentAlive = !!(c.parentId && lib.has(c.parentId));
            const linked = c.linked && parentAlive;
            return (
              <CardView
                key={c.id}
                def={def}
                seed={c.id}
                context="scenario"
                linked={linked}
                onChange={linked ? undefined : (fn) => updateCard(scenario.id, c.id, fn)}
                onUnlink={() => unlink(scenario.id, c.id)}
                onRemove={() => remove(scenario.id, c.id)}
                drag={{ type: DRAG_MOVE(kind), id: c.id }}
                dropAccept={DRAG_MOVE(kind)}
                onDropBefore={(dragged) => move(scenario.id, dragged, c.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function TotalsFooter({ totals, taxRate, seed }: { totals: ScenarioTotals; taxRate: number; seed: string }) {
  const period = useStore((s) => s.period);
  const pm = PERIODS.find((p) => p.id === period)!;
  const per = (n: number) => n / pm.perYear;
  return (
    <footer className="totals cycle" style={cycle(seed + ':totals', 120, 360)} aria-live="polite">
      <dl className="totals-grid">
        <div><dt>Gross income</dt><dd>{money(per(totals.grossIncome))}</dd></div>
        <div><dt>Tax ({taxRate}%)</dt><dd className="neg">{money(-per(totals.tax))}</dd></div>
        <div><dt>Net income</dt><dd>{money(per(totals.netIncome))}</dd></div>
        <div><dt>Expenses</dt><dd className="neg">{money(-per(totals.expenses))}</dd></div>
        <div><dt>Hours</dt><dd>{hoursFmt(per(totals.hours))}</dd></div>
      </dl>
      <div className="headline">
        <div className="big">
          <span className="big-label">EDI <small>/{pm.short}</small></span>
          <span className={'big-value' + (totals.edi < 0 ? ' neg' : '')}>{money(per(totals.edi))}</span>
        </div>
        <div className="big big--accent">
          <span className="big-label">EDI / hour</span>
          <span className={'big-value' + ((totals.ediPerHour ?? 0) < 0 ? ' neg' : '')}>
            {totals.ediPerHour === null ? '—' : money(totals.ediPerHour)}
          </span>
        </div>
      </div>
      {totals.errors > 0 && <p className="totals-warn">{totals.errors} card{totals.errors > 1 ? 's have' : ' has'} formula errors (counted as 0).</p>}
      {totals.hours <= 0 && totals.counts.income + totals.counts.expense > 0 && (
        <p className="totals-warn subtle">Add Hours cards to get an EDI / hour figure.</p>
      )}
    </footer>
  );
}
