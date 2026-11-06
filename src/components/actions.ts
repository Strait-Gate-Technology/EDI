import { emptyData, sampleData, useStore } from '../store';
import { confirmDialog, toast } from './Dialog';

/** Add a library card to a scenario, toasting the outcome (incl. auto-created variables). */
export function addCardWithToast(scenarioId: string, libraryId: string): boolean {
  const st = useStore.getState();
  const card = st.library.find((c) => c.id === libraryId);
  const sc = st.scenarios.find((s) => s.id === scenarioId);
  const added = st.addCardToScenario(scenarioId, libraryId);
  const name = card?.name ?? 'That card';
  if (!added) {
    toast(`“${name}” is already linked in this scenario`);
    return false;
  }
  toast(
    added.length
      ? `Added “${name}” · new scenario variable${added.length > 1 ? 's' : ''} ${added.join(', ')} — set ${added.length > 1 ? 'their values' : 'its value'}`
      : `Added “${name}” to ${sc?.name ?? 'the scenario'}`,
  );
  return true;
}

/** Shared, confirmed delete used by the editor button, the rack menu and the Delete key. */
export async function askDeleteScenario(id: string) {
  const sc = useStore.getState().scenarios.find((s) => s.id === id);
  if (!sc) return;
  const ok = await confirmDialog({
    title: `Delete “${sc.name || 'Untitled'}”?`,
    message: 'The scenario and its cards are removed. Library cards are kept.',
    confirmLabel: 'Delete scenario',
    danger: true,
  });
  if (ok) useStore.getState().deleteScenario(id);
}

export async function askStartOver() {
  const { scenarios, library, startOver } = useStore.getState();
  if (scenarios.length === 0 && library.length === 0) return;
  const ok = await confirmDialog({
    title: 'Start over?',
    message: `This deletes all ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'} and all ${library.length} library card${library.length === 1 ? '' : 's'} (incomes, expenses and hours). Your location and display settings are kept. Tip: ☰ → Export JSON first if you might want them back.`,
    confirmLabel: 'Delete everything',
    danger: true,
  });
  if (ok) startOver();
}

export async function askLoadSample() {
  if (await confirmDialog({ title: 'Load sample data?', message: 'Replaces all current cards and scenarios.', confirmLabel: 'Replace', danger: true })) {
    useStore.getState().replaceAll(sampleData());
  }
}

export async function askClearAll() {
  if (await confirmDialog({ title: 'Clear everything?', message: 'Deletes all cards and scenarios and resets settings.', confirmLabel: 'Clear', danger: true })) {
    useStore.getState().replaceAll(emptyData());
  }
}

export async function askDeleteLibraryCard(id: string, uses: number) {
  const { library, deleteLibraryCard } = useStore.getState();
  const c = library.find((x) => x.id === id);
  if (!c) return;
  if (uses > 0) {
    const ok = await confirmDialog({
      title: `Delete “${c.name}”?`,
      message: `It is linked in ${uses} scenario card${uses > 1 ? 's' : ''}. Those copies will be unlinked and kept as they are.`,
      confirmLabel: 'Delete card',
      danger: true,
    });
    if (!ok) return;
  }
  deleteLibraryCard(id);
}
