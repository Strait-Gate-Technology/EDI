import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';

/**
 * In-app replacement for window.confirm / window.alert, plus choice dialogs and
 * content panels. Native dialogs are silently suppressed in some embedded and in-app
 * browsers (confirm() just returns false), which made deletes impossible there.
 */
interface DialogButton {
  label: string;
  value: string;
  tone?: 'primary' | 'danger' | 'plain';
  /** Receives focus when the dialog opens. */
  focus?: boolean;
}

interface DialogRequest {
  title: string;
  message?: string;
  body?: ReactNode;
  wide?: boolean;
  buttons: DialogButton[];
  resolve: (value: string | null) => void;
}

const useDialog = create<{ current: DialogRequest | null; queue: DialogRequest[] }>(() => ({ current: null, queue: [] }));

function push(req: DialogRequest) {
  const s = useDialog.getState();
  if (s.current) useDialog.setState({ queue: [...s.queue, req] });
  else useDialog.setState({ current: req });
}

function settle(value: string | null) {
  const s = useDialog.getState();
  s.current?.resolve(value);
  const [next, ...rest] = s.queue;
  useDialog.setState({ current: next ?? null, queue: rest });
}

export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) =>
    push({
      title: opts.title,
      message: opts.message,
      buttons: [
        // Destructive actions default-focus Cancel so a stray Enter doesn't delete.
        { label: opts.cancelLabel ?? 'Cancel', value: 'cancel', tone: 'plain', focus: !!opts.danger },
        { label: opts.confirmLabel ?? 'OK', value: 'ok', tone: opts.danger ? 'danger' : 'primary', focus: !opts.danger },
      ],
      resolve: (v) => resolve(v === 'ok'),
    }),
  );
}

export function alertDialog(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => push({ title, message, buttons: [{ label: 'OK', value: 'ok', tone: 'primary', focus: true }], resolve: () => resolve() }));
}

/** Several options; resolves to the chosen value, or null if dismissed. */
export function chooseDialog(opts: { title: string; message?: string; buttons: DialogButton[] }): Promise<string | null> {
  return new Promise((resolve) => push({ ...opts, resolve }));
}

/** A panel with custom content and a Close button. */
export function openPanel(title: string, body: ReactNode): Promise<void> {
  return new Promise((resolve) => push({ title, body, wide: true, buttons: [{ label: 'Close', value: 'close', tone: 'plain', focus: true }], resolve: () => resolve() }));
}

export function DialogHost() {
  const req = useDialog((s) => s.current);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!req) return;
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>('[data-autofocus="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); settle(null); }
      if (e.key === 'Tab' && boxRef.current) {
        const f = [...boxRef.current.querySelectorAll<HTMLElement>('button, input, a[href]')].filter((x) => !(x as HTMLButtonElement).disabled);
        const i = f.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
  }, [req]);

  if (!req) return null;
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && settle(null)}>
      <div
        ref={boxRef}
        className={'dialog' + (req.wide ? ' dialog--wide' : '')}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby={req.message ? 'dlg-msg' : undefined}
      >
        <h2 id="dlg-title">{req.title}</h2>
        {req.message && <p id="dlg-msg">{req.message}</p>}
        {req.body}
        <div className="dialog-actions">
          {req.buttons.map((b) => (
            <button
              key={b.value}
              type="button"
              data-autofocus={b.focus ? 'true' : undefined}
              className={'glass-btn' + (b.tone === 'primary' ? ' dialog-ok' : b.tone === 'danger' ? ' dialog-ok is-danger' : '')}
              onClick={() => settle(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Toasts (small, transient confirmations) ---------------- */
const useToast = create<{ msg: string | null; n: number }>(() => ({ msg: null, n: 0 }));
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  clearTimeout(toastTimer);
  useToast.setState((s) => ({ msg, n: s.n + 1 }));
  toastTimer = setTimeout(() => useToast.setState({ msg: null }), 2600);
}

export function ToastHost() {
  const { msg, n } = useToast();
  if (!msg) return null;
  return (
    <div key={n} className="toast" role="status" aria-live="polite">
      {msg}
    </div>
  );
}
