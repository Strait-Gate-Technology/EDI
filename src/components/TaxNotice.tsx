import { useEffect, useState } from 'react';
import { TAX_YEAR } from '../tax/engine';

interface TaxStatus {
  checkedAt: string;
  dataYear: number;
  ok: boolean;
  problems: string[];
}

/** Scheduled re-check runs quarterly; allow a little slack before calling it stale. */
const STALE_DAYS = 100;
const DISMISS_KEY = 'edi-tax-notice-dismissed';

function evaluate(s: TaxStatus | null): string[] {
  const out: string[] = [];
  if (new Date().getFullYear() > TAX_YEAR) out.push(`Brackets are for ${TAX_YEAR}.`);
  if (!s) return out;
  if (!s.ok) out.push(...s.problems);
  const age = (Date.now() - Date.parse(s.checkedAt)) / 86_400_000;
  if (age > STALE_DAYS) out.push(`Official sources were last re-checked ${new Date(s.checkedAt).toLocaleDateString()}.`);
  return [...new Set(out)];
}

/** A small, dismissible notice — only shown when the tax data may be out of date. */
export function TaxNotice() {
  const [problems, setProblems] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    let alive = true;
    fetch('/tax-status.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<TaxStatus>) : null))
      .catch(() => null) // offline: just rely on the year check
      .then((s) => alive && setProblems(evaluate(s)));
    return () => { alive = false; };
  }, []);

  if (dismissed || problems.length === 0) return null;
  return (
    <div className="tax-notice" role="status" title={problems.join('\n')}>
      <span aria-hidden="true">⚠</span>
      <span>Tax brackets may not be perfectly accurate — the latest check of official sources didn't fully succeed.</span>
      <button
        type="button"
        className="tool"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
        }}
      >
        ×
      </button>
    </div>
  );
}
