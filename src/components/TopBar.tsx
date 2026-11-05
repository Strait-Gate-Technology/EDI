import { useEffect, useRef, useState } from 'react';
import { money } from '../calc';
import { emptyData, sampleData, useStore, type AppData } from '../store';
import { PERIODS } from '../types';
import { LocationPicker, ScenarioTitle } from './Flag';
import { DRAG_SCENARIO, DRAG_SLOT, scrollAndFocus, useAllTotals } from './hooks';
import { Icon, Menu, cycle } from './ui';

export function TopBar() {
  const scenarios = useStore((s) => s.scenarios);
  const activeId = useStore((s) => s.activeScenarioId);
  const view = useStore((s) => s.view);
  const period = useStore((s) => s.period);
  const location = useStore((s) => s.location);
  const reduceEffects = useStore((s) => s.reduceEffects);
  const focusId = useStore((s) => s.focusTarget?.id);
  const { addScenario, setActive, setView, setPeriod, replaceAll, setLocation, setReduceEffects, clearSlot, duplicateScenario, deleteScenario, startOver } = useStore.getState();
  const library = useStore((s) => s.library);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const ctxScenario = ctx ? scenarios.find((s) => s.id === ctx.id) : undefined;

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const onDown = (e: PointerEvent) => !(e.target as Element).closest?.('.context-menu') && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [ctx]);

  const onStartOver = () => {
    if (scenarios.length === 0 && library.length === 0) return;
    const msg = `Start over? This deletes all ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'} and all ${library.length} library card${library.length === 1 ? '' : 's'} (incomes, expenses and hours). Your location and display settings are kept.

Tip: ☰ → Export JSON first if you might want them back.`;
    if (confirm(msg)) startOver();
  };
  const totals = useAllTotals();
  const fileRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const [rackHover, setRackHover] = useState(false);

  // Bring a newly created scenario's tab into view.
  useEffect(() => {
    if (!focusId) return;
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-sid="${focusId}"]`);
    if (tab) scrollAndFocus(tab);
  }, [focusId]);

  const exportData = () => {
    const s = useStore.getState();
    const data: AppData = {
      library: s.library, scenarios: s.scenarios, activeScenarioId: s.activeScenarioId,
      view: s.view, period: s.period, analysis: s.analysis, location: s.location, reduceEffects: s.reduceEffects,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `edi-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as AppData;
      if (!Array.isArray(data.library) || !Array.isArray(data.scenarios)) throw new Error('Not an EDI export');
      for (const sc of data.scenarios) sc.location ??= { linked: true, ...(data.location ?? emptyData().location) };
      replaceAll({ ...emptyData(), ...data });
    } catch (e) {
      alert('Could not import: ' + (e instanceof Error ? e.message : e));
    }
  };

  return (
    <header className="topbar glass cycle" style={cycle('topbar', 260, 540)}>
      <button type="button" className="glass-btn new-scenario" onClick={addScenario} title="New Scenario">
        <span className="plus-orb cycle" style={cycle('plus-orb', 90, 200)}><Icon name="plus" size={18} /></span>
        <span className="label">New Scenario</span>
      </button>
      <button
        type="button"
        className="glass-btn start-over"
        onClick={onStartOver}
        disabled={scenarios.length === 0 && library.length === 0}
        title="Delete all scenarios and library cards"
      >
        <Icon name="trash" size={14} />
        <span className="label">Start Over</span>
      </button>

      <nav
        ref={tabsRef}
        className={'scenario-tabs drop-target' + (rackHover ? ' is-hover' : '')}
        aria-label="Scenarios"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_SLOT)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setRackHover(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setRackHover(false)}
        onDrop={(e) => {
          setRackHover(false);
          const from = e.dataTransfer.getData(DRAG_SLOT);
          if (from !== '') {
            e.preventDefault();
            clearSlot(Number(from));
          }
        }}
      >
        {scenarios.map((s) => {
          const v = totals.get(s.id)?.ediPerHour;
          return (
            <button
              key={s.id}
              data-sid={s.id}
              type="button"
              draggable
              className={'scenario-tab cycle' + (s.id === activeId && view === 'build' ? ' is-active' : '')}
              style={cycle(s.id + ':tab', 160, 400)}
              onClick={() => { setActive(s.id); setView('build'); }}
              onContextMenu={(e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                // Keyboard-opened menus report (0,0): anchor under the tab instead.
                const x = e.clientX || r.left;
                const y = e.clientY || r.bottom + 4;
                setCtx({ id: s.id, x: Math.min(x, window.innerWidth - 200), y: Math.min(y, window.innerHeight - 110) });
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_SCENARIO, s.id);
                e.dataTransfer.setData('text/plain', s.name);
                e.dataTransfer.effectAllowed = 'copyMove';
                document.body.classList.add('dragging-scenario');
              }}
              onDragEnd={() => document.body.classList.remove('dragging-scenario')}
              title={view === 'analysis' ? `Drag “${s.name}” onto a column, or click to edit` : `Edit ${s.name}`}
            >
              <span className="tab-name"><ScenarioTitle scenario={s} /></span>
              <span className="tab-metric">{v == null ? '—' : money(v)}<small>/h</small></span>
            </button>
          );
        })}
        {rackHover && <span className="rack-hint">Drop to take it off the stage</span>}
      </nav>

      {ctx && ctxScenario && (
        <div className="menu context-menu" role="menu" aria-label={`${ctxScenario.name} actions`} style={{ left: ctx.x, top: ctx.y }}>
          <div className="context-title">{ctxScenario.name || 'Untitled'}</div>
          <button
            type="button"
            role="menuitem"
            className="menu-item row"
            autoFocus
            onClick={() => { setCtx(null); duplicateScenario(ctxScenario.id); }}
          >
            <Icon name="copy" size={14} /> Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item row danger"
            onClick={() => {
              setCtx(null);
              if (confirm(`Delete scenario "${ctxScenario.name}"?`)) deleteScenario(ctxScenario.id);
            }}
          >
            <Icon name="trash" size={14} /> Delete
          </button>
        </div>
      )}

      <div className="topbar-right">
        <LocationPicker value={location} onChange={setLocation} labelPrefix="Default " />
        <div className="segmented" role="group" aria-label="Display period">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={period === p.id ? 'is-on' : ''} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}>
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={'glass-btn analysis-btn' + (view === 'analysis' ? ' is-on' : '')}
          onClick={() => setView(view === 'analysis' ? 'build' : 'analysis')}
        >
          <Icon name={view === 'analysis' ? 'back' : 'chart'} />
          {view === 'analysis' ? 'Back to builder' : 'Analysis'}
        </button>
        <Menu
          label="Data"
          align="right"
          trigger={<Icon name="menu" />}
          items={[
            {
              label: reduceEffects ? '✓ Reduce visual effects' : 'Reduce visual effects',
              hint: 'Stops colour cycling & background drift',
              onClick: () => setReduceEffects(!reduceEffects),
            },
            { label: 'Export JSON', hint: 'Download all cards & scenarios', onClick: exportData },
            { label: 'Import JSON…', hint: 'Replace with an export', onClick: () => fileRef.current?.click() },
            { label: 'Load sample data', hint: 'Replaces current data', onClick: () => confirm('Replace everything with the sample data?') && replaceAll(sampleData()) },
            { label: 'Clear everything', danger: true, onClick: () => confirm('Delete all cards and scenarios?') && replaceAll(emptyData()) },
          ]}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
