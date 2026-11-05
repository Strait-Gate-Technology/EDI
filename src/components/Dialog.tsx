import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/**
 * In-app replacement for window.confirm / window.alert.
 * Native dialogs are silently suppressed in some embedded and in-app browsers
 * (confirm() just returns false), which made deletes impossible there.
 */
interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useDialog = create<{ current: DialogRequest | null; queue: DialogRequest[] }>(() => ({ current: null, queue: [] }));

function push(req: DialogRequest) {
  const s = useDialog.getState();
  if (s.current) useDialog.setState({ queue: [...s.queue, req] });
  else useDialog.setState({ current: req });
}

function settle(ok: boolean) {
  const s = useDialog.getState();
  s.current?.resolve(ok);
  const [next, ...rest] = s.queue;
  useDialog.setState({ current: next ?? null, queue: rest });
}

export function confirmDialog(opts: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => push({ confirmLabel: 'OK', cancelLabel: 'Cancel', ...opts, resolve }));
}

export function alertDialog(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => push({ title, message, confirmLabel: 'OK', cancelLabel: null, resolve: () => resolve() }));
}

export function DialogHost() {
  const req = useDialog((s) => s.current);
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!req) return;
    const prev = document.activeElement as HTMLElement | null;
    // Destructive actions default-focus Cancel so a stray Enter doesn't delete.
    (req.danger && cancelRef.current ? cancelRef.current : okRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); settle(false); }
      if (e.key === 'Tab' && boxRef.current) {
        const f = [...boxRef.current.querySelectorAll<HTMLElement>('button')];
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
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && settle(false)}>
      <div ref={boxRef} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby={req.message ? 'dlg-msg' : undefined}>
        <h2 id="dlg-title">{req.title}</h2>
        {req.message && <p id="dlg-msg">{req.message}</p>}
        <div className="dialog-actions">
          {req.cancelLabel !== null && (
            <button ref={cancelRef} type="button" className="glass-btn" onClick={() => settle(false)}>
              {req.cancelLabel}
            </button>
          )}
          <button ref={okRef} type="button" className={'glass-btn dialog-ok' + (req.danger ? ' is-danger' : '')} onClick={() => settle(true)}>
            {req.confirmLabel}
          </button>
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
  toastTimer = setTimeout(() => useToast.setState({ msg: null }), 2200);
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
