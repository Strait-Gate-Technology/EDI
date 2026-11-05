import { useEffect } from 'react';
import { Analysis } from './components/Analysis';
import { Background } from './components/Background';
import { DialogHost, ToastHost } from './components/Dialog';
import { useIsMobile } from './components/hooks';
import { LibraryPanel } from './components/LibraryPanel';
import { ScenarioPanel } from './components/ScenarioPanel';
import { TaxNotice } from './components/TaxNotice';
import { TopBar } from './components/TopBar';
import { Icon } from './components/ui';
import { useStore, type MobilePane } from './store';


export default function App() {
  const view = useStore((s) => s.view);
  const reduceEffects = useStore((s) => s.reduceEffects);
  const pane = useStore((s) => s.mobilePane);
  const setPane = useStore((s) => s.setMobilePane);
  const mobile = useIsMobile();

  useEffect(() => {
    document.body.classList.toggle('calm', reduceEffects);
  }, [reduceEffects]);

  useEffect(() => {
    document.body.classList.toggle('is-mobile', mobile);
  }, [mobile]);

  // Safety net: if a drag is cancelled outside the window, clear drag-state classes.
  useEffect(() => {
    const clear = () => document.body.classList.remove('dragging-scenario', 'dragging-slot', 'dragging-income', 'dragging-expense', 'dragging-hours');
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  return (
    <div className={'app' + (mobile ? ' app--mobile' : '')}>
      <Background />
      <TopBar mobile={mobile} />
      {view === 'build' ? (
        <div className={'builder' + (mobile ? ' builder--' + pane : '')}>
          {(!mobile || pane === 'library') && <LibraryPanel />}
          {(!mobile || pane === 'scenario') && <ScenarioPanel />}
        </div>
      ) : (
        <Analysis mobile={mobile} />
      )}
      {mobile && <MobileNav pane={pane} setPane={setPane} />}
      <TaxNotice />
      <DialogHost />
      <ToastHost />
    </div>
  );
}

function MobileNav({ pane, setPane }: { pane: MobilePane; setPane: (p: MobilePane) => void }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const items: { id: MobilePane | 'analysis'; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { id: 'library', label: 'Library', icon: 'menu' },
    { id: 'scenario', label: 'Scenario', icon: 'copy' },
    { id: 'analysis', label: 'Analysis', icon: 'chart' },
  ];
  const current = view === 'analysis' ? 'analysis' : pane;
  return (
    <nav className="mobile-nav glass" aria-label="Sections">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={current === it.id ? 'is-on' : ''}
          aria-current={current === it.id ? 'page' : undefined}
          onClick={() => {
            if (it.id === 'analysis') setView('analysis');
            else {
              setView('build');
              setPane(it.id);
            }
          }}
        >
          <Icon name={it.icon} size={18} />
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
