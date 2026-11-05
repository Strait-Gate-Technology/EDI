import { useMemo, useRef } from 'react';
import { scenarioTotals, money } from '../calc';
import { emptyData, sampleData, useStore, type AppData } from '../store';
import { PERIODS } from '../types';
import { useLibraryMap } from './ScenarioPanel';
import { Icon, Menu, cycle } from './ui';

export function TopBar() {
  const scenarios = useStore((s) => s.scenarios);
  const activeId = useStore((s) => s.activeScenarioId);
  const view = useStore((s) => s.view);
  const period = useStore((s) => s.period);
  const { addScenario, setActive, setView, setPeriod, replaceAll } = useStore.getState();
  const lib = useLibraryMap();
  const fileRef = useRef<HTMLInputElement>(null);

  const perHour = useMemo(
    () => new Map(scenarios.map((s) => [s.id, scenarioTotals(s, lib).ediPerHour])),
    [scenarios, lib],
  );

  const exportData = () => {
    const s = useStore.getState();
    const data: AppData = {
      library: s.library, scenarios: s.scenarios, activeScenarioId: s.activeScenarioId,
      view: s.view, period: s.period, analysis: s.analysis,
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

      <nav className="scenario-tabs" aria-label="Scenarios">
        {scenarios.map((s) => {
          const v = perHour.get(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={'scenario-tab cycle' + (s.id === activeId && view === 'build' ? ' is-active' : '')}
              style={cycle(s.id + ':tab', 160, 400)}
              onClick={() => { setActive(s.id); setView('build'); }}
              title={`Edit ${s.name}`}
            >
              <span className="tab-name">{s.name || 'Untitled'}</span>
              <span className="tab-metric">{v == null ? '—' : money(v)}<small>/h</small></span>
            </button>
          );
        })}
      </nav>

      <div className="topbar-right">
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
