import { useEffect, useRef, useState, type DragEvent } from 'react';
import { effectiveDef, hoursFmt, money, pct, type ScenarioTotals } from '../calc';
import { scenarioLocation, useStore } from '../store';
import { TAX_ASSUMPTIONS, TAX_YEAR, hasIncomeTax } from '../tax/engine';
import { countryOf, regionName } from '../tax/regions';
import { KINDS, KIND_META, PERIODS, type CardDef, type Kind, type Scenario } from '../types';
import { CardView } from './CardView';
import { LocationPicker, LocationSuffix } from './Flag';
import { scrollAndFocus, useAllTotals, useLibraryMap } from './hooks';
import { DRAG_LIB } from './LibraryPanel';
import { Icon, cycle } from './ui';

export const DRAG_MOVE = (k: Kind) => `application/x-edi-move-${k}`;
export { useLibraryMap };

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
  const global = useStore((s) => s.location);
  const totals = useAllTotals().get(scenario.id)!;
  const loc = scenarioLocation(scenario, global);

  // Jump to (and select the name of) a freshly created / duplicated scenario.
  const focusNonce = useStore((s) => (s.focusTarget?.id === scenario.id ? s.focusTarget.nonce : 0));
  const clearFocus = useStore((s) => s.clearFocus);
  const cardRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusNonce) return;
    cardRef.current?.closest('.workspace')?.scrollTo({ top: 0, behavior: 'smooth' });
    scrollAndFocus(cardRef.current, nameRef.current);
    clearFocus(scenario.id);
  }, [focusNonce, scenario.id, clearFocus]);

  return (
    <article ref={cardRef} className="scenario-card glass-dark cycle" style={cycle(scenario.id + ':scard', 200, 520)}>
      <header className="scenario-head">
        <div className="scenario-title">
          <input
            ref={nameRef}
            className="scenario-name"
            value={scenario.name}
            aria-label="Scenario name"
            spellCheck={false}
            size={Math.max(8, scenario.name.length + 1)}
            onChange={(e) => update(scenario.id, (s) => { s.name = e.target.value; })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <LocationSuffix loc={loc} />
        </div>
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
          <Zone key={k} kind={k} scenario={scenario} lib={lib} totals={totals} />
        ))}
      </div>

      <TotalsFooter totals={totals} seed={scenario.id} />
    </article>
  );
}

function ScenarioLocationControl({ scenario }: { scenario: Scenario }) {
  const global = useStore((s) => s.location);
  const setLoc = useStore((s) => s.setScenarioLocation);
  const loc = scenarioLocation(scenario, global);
  const linked = scenario.location.linked;
  return (
    <div className="zone-location">
      <span className="zone-location-label">Tax</span>
      <LocationPicker value={loc} prefer={global} onChange={(l) => setLoc(scenario.id, l)} labelPrefix="Scenario " />
      <button
        type="button"
        className={'chain' + (linked ? ' is-linked' : ' is-broken')}
        disabled={linked}
        onClick={() => setLoc(scenario.id, global)}
        title={linked ? 'Following the app-wide location (top bar)' : 'Custom location — click to follow the app-wide location again'}
        aria-label={linked ? 'Following app-wide location' : 'Reset to app-wide location'}
      >
        <Icon name={linked ? 'link' : 'unlink'} size={13} />
      </button>
    </div>
  );
}

function TaxCard({ totals }: { totals: ScenarioTotals }) {
  const period = useStore((s) => s.period);
  const pm = PERIODS.find((p) => p.id === period)!;
  const per = (n: number) => n / pm.perYear;
  const { taxDetail: t, location: loc } = totals;
  const fedLabel = loc.country === 'CA' ? 'Federal' : 'Federal (IRS)';
  const regLabel = loc.country === 'CA' ? (['NT', 'NU', 'YT'].includes(loc.region) ? 'Territorial' : 'Provincial') : 'State';
  return (
    <div className="card card--tax cycle" style={cycle('taxcard:' + loc.country + loc.region, 200, 460)}>
      <div className="card-head">
        <span className="type-badge" aria-hidden="true">%</span>
        <span className="card-name static">Income tax · {TAX_YEAR}</span>
        <span className="info" tabIndex={0} title={TAX_ASSUMPTIONS.join('\n') + (t.note ? '\n\n' + t.note : '')} aria-label="Assumptions">ⓘ</span>
      </div>
      <dl className="tax-rows">
        <div><dt>Taxable income</dt><dd>{money(per(t.taxable))}</dd></div>
        <div><dt>{fedLabel}</dt><dd className="neg">{money(-per(t.federal))}</dd></div>
        <div>
          <dt>{regLabel} · {regionName(loc.country, loc.region)}</dt>
          <dd className="neg">{hasIncomeTax(loc.country, loc.region) ? money(-per(t.regional)) : 'none'}</dd>
        </div>
        {t.lines.map((l) => (
          <div key={l.label} className="sub"><dt>incl. {l.label}</dt><dd>{money(per(l.amount))}</dd></div>
        ))}
        <div className="total"><dt>Total tax</dt><dd className="neg">{money(-per(t.total))}</dd></div>
      </dl>
      <div className="tax-rates">
        <span>Effective <b>{pct(t.effectiveRate)}</b></span>
        <span>Marginal <b>{pct(t.marginalRate)}</b></span>
        <span className="muted">{countryOf(loc.country).short}</span>
      </div>
    </div>
  );
}

function Zone({ kind, scenario, lib, totals }: { kind: Kind; scenario: Scenario; lib: Map<string, CardDef>; totals: ScenarioTotals }) {
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
        if (state !== c) setState(c);
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
        {kind === 'income' && <ScenarioLocationControl scenario={scenario} />}
        <span className="zone-hint">
          {state === 'reject' ? `Only ${KIND_META[kind].label.toLowerCase()} cards belong here` : state === 'accept' ? 'Drop to add' : `${cards.length} card${cards.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="zone-cards">
        {cards.length === 0 && <div className="zone-empty">Drag {KIND_META[kind].label.toLowerCase()} cards here</div>}
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
        {kind === 'income' && <TaxCard totals={totals} />}
      </div>
    </section>
  );
}

export function TotalsFooter({ totals, seed }: { totals: ScenarioTotals; seed: string }) {
  const period = useStore((s) => s.period);
  const pm = PERIODS.find((p) => p.id === period)!;
  const per = (n: number) => n / pm.perYear;
  return (
    <footer className="totals cycle" style={cycle(seed + ':totals', 120, 360)} aria-live="polite">
      <dl className="totals-grid">
        <div><dt>Gross income</dt><dd>{money(per(totals.grossIncome))}</dd></div>
        <div><dt>Income tax ({pct(totals.taxDetail.effectiveRate)})</dt><dd className="neg">{money(-per(totals.tax))}</dd></div>
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
