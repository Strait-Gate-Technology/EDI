import { Analysis } from './components/Analysis';
import { Background } from './components/Background';
import { LibraryPanel } from './components/LibraryPanel';
import { ScenarioPanel } from './components/ScenarioPanel';
import { TopBar } from './components/TopBar';
import { useStore } from './store';

export default function App() {
  const view = useStore((s) => s.view);
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
    </div>
  );
}
