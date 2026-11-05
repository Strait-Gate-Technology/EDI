import { useEffect } from 'react';
import { Analysis } from './components/Analysis';
import { Background } from './components/Background';
import { LibraryPanel } from './components/LibraryPanel';
import { ScenarioPanel } from './components/ScenarioPanel';
import { TaxNotice } from './components/TaxNotice';
import { TopBar } from './components/TopBar';
import { useStore } from './store';

export default function App() {
  const view = useStore((s) => s.view);
  const reduceEffects = useStore((s) => s.reduceEffects);

  useEffect(() => {
    document.body.classList.toggle('calm', reduceEffects);
  }, [reduceEffects]);

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
    <div className="app">
      <Background />
      <TopBar />
      {view === 'build' ? (
        <div className="builder">
          <LibraryPanel />
          <ScenarioPanel />
        </div>
      ) : (
        <Analysis />
      )}
      <TaxNotice />
    </div>
  );
}
