import { useEffect, useRef, useState } from 'react';
import { emptyData, useStore, type AppData } from '../store';
import { PERIODS } from '../types';
import { askClearAll, askDeleteScenario, askLoadSample, askStartOver } from './actions';
import { alertDialog } from './Dialog';
import { EdiPerHour } from './Edi';
import { LocationPicker, ScenarioTitle } from './Flag';
import { openShare } from './Share';
import { DRAG_SCENARIO, DRAG_SLOT, scrollAndFocus, useAllTotals } from './hooks';
import { Icon, Menu, cycle } from './ui';

export function TopBar({ mobile = false }: { mobile?: boolean }) {
  const scenarios = useStore((s) => s.scenarios);
  const activeId = useStore((s) => s.activeScenarioId);
  const view = useStore((s) => s.view);
  const period = useStore((s) => s.period);
  const location = useStore((s) => s.location);
  const reduceEffects = useStore((s) => s.reduceEffects);
  const focusId = useStore((s) => s.focusTarget?.id);
  const { addScenario, setActive, setView, setPeriod, replaceAll, setLocation, setReduceEffects, clearSlot, duplicateScenario } = useStore.getState();
  const library = useStore((s) => s.library);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  // Touch long-press opens the same menu as right-click (iOS never fires contextmenu).
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);
  const openCtx = (id: string, x: number, y: number) =>
    setCtx({ id, x: Math.max(8, Math.min(x, window.innerWidth - 200)), y: Math.min(y, window.innerHeight - 120) });
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
      alertDialog('Could not import', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <header className="topbar glass cycle" style={cycle('topbar', 260, 540)}>
      <button type="button" className="glass-btn new-scenario" onClick={addScenario} title="New Scenario">
        <span className="plus-orb cycle" style={cycle('plus-orb', 90, 200)}><Icon name="plus" size={18} /></span>
        <span className="label">{mobile ? 'New' : 'New Scenario'}</span>
      </button>
      <button
        type="button"
        className="glass-btn start-over"
        onClick={askStartOver}
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
          const t = totals.get(s.id);
          return (
            <button
              key={s.id}
              data-sid={s.id}
              type="button"
              draggable={!mobile}
              className={'scenario-tab cycle' + (s.id === activeId && view === 'build' ? ' is-active' : '')}
              style={cycle(s.id + ':tab', 160, 400)}
              onClick={() => {
                if (press.current?.fired) { press.current.fired = false; return; }
                setActive(s.id);
                setView('build');
              }}
              onPointerDown={(e) => {
                if (e.pointerType !== 'touch') return;
                const st = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => { st.fired = true; openCtx(s.id, st.x, st.y + 12); }, 480) };
                if (press.current) clearTimeout(press.current.timer);
                press.current = st;
              }}
              onPointerMove={(e) => {
                const p = press.current;
                if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.timer);
              }}
              onPointerUp={() => press.current && clearTimeout(press.current.timer)}
              onPointerCancel={() => press.current && clearTimeout(press.current.timer)}
              onKeyDown={(e) => {
                if (e.key === 'Delete') { e.preventDefault(); askDeleteScenario(s.id); }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                // Keyboard-opened menus report (0,0): anchor under the tab instead.
                const x = e.clientX || r.left;
                const y = e.clientY || r.bottom + 4;
                if (press.current?.fired) return; // already opened by long-press
                openCtx(s.id, x, y);
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_SCENARIO, s.id);
                e.dataTransfer.setData('text/plain', s.name);
                e.dataTransfer.effectAllowed = 'copyMove';
                document.body.classList.add('dragging-scenario');
              }}
              onDragEnd={() => document.body.classList.remove('dragging-scenario')}
              title={mobile ? `${s.name} — long-press for options` : view === 'analysis' ? `Drag “${s.name}” onto a column, or click to edit. Right-click for options.` : `Edit ${s.name}. Right-click for options; Delete key deletes.`}
            >
              <span className="tab-name"><ScenarioTitle scenario={s} compact /></span>
              <span className={'tab-metric' + ((t?.ediPerHour ?? 0) < 0 ? ' neg' : '')}>{t ? <EdiPerHour t={t} /> : '—'}<small>/h</small></span>
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
              askDeleteScenario(ctxScenario.id);
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
            <button key={p.id} type="button" className={period === p.id ? 'is-on' : ''} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id} title={p.label}>
              {mobile ? p.short.charAt(0).toUpperCase() + p.short.slice(1) : p.label}
            </button>
          ))}
        </div>
        {!mobile && (
          <button
            type="button"
            className={'glass-btn analysis-btn' + (view === 'analysis' ? ' is-on' : '')}
            onClick={() => setView(view === 'analysis' ? 'build' : 'analysis')}
          >
            <Icon name={view === 'analysis' ? 'back' : 'chart'} />
            {view === 'analysis' ? 'Back to builder' : 'Analysis'}
          </button>
        )}
        <button
          type="button"
          className="glass-btn icon-btn share-btn"
          onClick={() => openShare()}
          disabled={scenarios.length === 0 && library.length === 0}
          title="Share project (link or QR code)"
          aria-label="Share project"
        >
          <Icon name="share" />
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
            { label: 'Share project…', hint: 'Link or QR code with everything', onClick: () => openShare() },
            { label: 'Export JSON', hint: 'Download all cards & scenarios', onClick: exportData },
            { label: 'Import JSON…', hint: 'Replace with an export', onClick: () => fileRef.current?.click() },
            { label: 'Load sample data', hint: 'Replaces current data', onClick: askLoadSample },
            { label: 'Clear everything', danger: true, onClick: askClearAll },
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
