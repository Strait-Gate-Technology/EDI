import { emptyData, sampleData, useStore } from '../store';
import { isTimeAware } from '../types';
import { confirmDialog, toast } from './Dialog';
import { openPeriodPicker } from './PeriodPicker';

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
  if (card?.frequency === 'once' && sc && !isTimeAware(sc)) {
    toastNeedsPeriod(name, scenarioId);
    return true;
  }
  toast(
    added.length
      ? `Added “${name}” · new scenario variable${added.length > 1 ? 's' : ''} ${added.join(', ')} — set ${added.length > 1 ? 'their values' : 'its value'}`
      : `Added “${name}” to ${sc?.name ?? 'the scenario'}`,
  );
  return true;
}

/** Guidance when a one-time card lands in a scenario without a Period of Interest. */
export function toastNeedsPeriod(name: string, scenarioId: string) {
  toast(`“${name}” is one-time: set this scenario’s Period of Interest (top of the scenario, e.g. “2026 · 1 year”) to count it`);
  focusPeriod(scenarioId, false);
}

/**
 * Bring a scenario's Period of Interest picker into view and pulse it.
 * `focus` also opens the picker with the cursor in its Starting input.
 */
export function focusPeriod(scenarioId: string, focus = true) {
  const st = useStore.getState();
  if (st.activeScenarioId !== scenarioId) st.setActive(scenarioId);
  if (st.view !== 'build') st.setView('build');
  if (st.mobilePane !== 'scenario' && document.body.classList.contains('is-mobile')) st.setMobilePane('scenario');
  let tries = 0;
  const go = () => {
    const el = document.querySelector<HTMLElement>(`[data-poi="${scenarioId}"]`);
    if (!el) {
      if (tries++ < 20) requestAnimationFrame(go);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.classList.remove('is-attention');
    void el.offsetWidth; // restart the animation
    el.classList.add('is-attention');
    setTimeout(() => el.classList.remove('is-attention'), 2400);
    if (focus) openPeriodPicker(scenarioId);
  };
  requestAnimationFrame(go);
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
