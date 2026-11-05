import { useMemo } from 'react';
import { hasLinkedCopy, useStore } from '../store';
import { KINDS, KIND_META, type Kind } from '../types';
import { askDeleteLibraryCard } from './actions';
import { CardView } from './CardView';
import { toast } from './Dialog';
import { Icon, cycle } from './ui';

export const DRAG_LIB = (k: Kind) => `application/x-edi-lib-${k}`;

export function LibraryPanel() {
  const library = useStore((s) => s.library);
  const scenarios = useStore((s) => s.scenarios);
  const activeId = useStore((s) => s.activeScenarioId);
  const add = useStore((s) => s.addLibraryCard);
  const update = useStore((s) => s.updateLibraryCard);
  const dup = useStore((s) => s.duplicateLibraryCard);
  const addToScenario = useStore((s) => s.addCardToScenario);

  const active = scenarios.find((s) => s.id === activeId);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of scenarios)
      for (const c of s.cards) if (c.linked && c.parentId) m.set(c.parentId, (m.get(c.parentId) ?? 0) + 1);
    return m;
  }, [scenarios]);

  return (
    <aside className="library panel glass cycle" style={cycle('library-panel', 300, 600)} aria-label="Card library">
      <header className="panel-head">
        <div>
          <h2>Library</h2>
          <p className="muted">Scenario-agnostic cards. Drag them by the grip into a scenario.</p>
        </div>
      </header>
      <div className="library-scroll">
        {KINDS.map((kind) => {
          const cards = library.filter((c) => c.kind === kind);
          return (
            <section key={kind} className={`lib-section lib-section--${kind}`}>
              <div className="lib-section-head">
                <h3>
                  <span className={`kind-dot kind-dot--${kind}`} />
                  {KIND_META[kind].plural}
                  <span className="count">{cards.length}</span>
                </h3>
                <button
                  type="button"
                  className="glass-btn small"
                  onClick={() => add(kind)}
                  aria-label={`New ${KIND_META[kind].label} card`}
                >
                  <Icon name="plus" size={13} /> New
                </button>
              </div>
              {cards.length === 0 && <p className="empty-hint">No {KIND_META[kind].plural.toLowerCase()} yet.</p>}
              <div className="lib-cards">
                {cards.map((c) => (
                  <CardView
                    key={c.id}
                    def={c}
                    seed={c.id}
                    context="library"
                    usage={usage.get(c.id) ?? 0}
                    onChange={(fn) => update(c.id, fn)}
                    onDuplicate={() => dup(c.id)}
                    onRemove={() => askDeleteLibraryCard(c.id, usage.get(c.id) ?? 0)}
                    onQuickAdd={active ? () => { if (addToScenario(active.id, c.id)) toast(`Added “${c.name}” to ${active.name}`); } : undefined}
                    quickAddDisabled={!!active && hasLinkedCopy(active, c.id)}
                    quickAddLabel={active ? (hasLinkedCopy(active, c.id) ? `Already linked in “${active.name}”` : `Add to “${active.name}”`) : undefined}
                    drag={{ type: DRAG_LIB(kind), id: c.id }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
