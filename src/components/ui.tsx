import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Stable 32-bit hash. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Per-component colour cycling: each seed gets its own starting hue,
 * cycle duration (2.5 – 8 min) and direction, so nothing moves in lock-step.
 */
export function cycle(seed: string, minSec = 150, maxSec = 480): CSSProperties {
  const h = hash(seed);
  const h0 = h % 360;
  const dur = minSec + ((h >>> 9) % (maxSec - minSec));
  const dir = (h >>> 3) & 1 ? 'normal' : 'reverse';
  return { '--h0': h0, '--dur': `${dur}s`, '--dir': dir } as CSSProperties;
}

type IconName =
  | 'plus' | 'link' | 'unlink' | 'trash' | 'grip' | 'copy' | 'x' | 'chart' | 'back' | 'arrow'
  | 'clock' | 'up' | 'down' | 'menu' | 'swap' | 'jump' | 'share' | 'qr';

const PATHS: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </>
  ),
  unlink: (
    <>
      <path d="M15.5 8.5l2-2a3.5 3.5 0 0 1 5 5l-2 2" transform="translate(-2 0)" />
      <path d="M8.5 15.5l-2 2a3.5 3.5 0 0 1-5-5l2-2" transform="translate(2 0)" />
      <path d="M8 3v3M3 8h3M16 21v-3M21 16h-3" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  grip: (
    <>
      <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
    </>
  ),
  copy: <path d="M8 8h11v11H8zM5 16V5h11" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  back: <path d="M15 5l-7 7 7 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  // corner-up-left: "back to the parent"
  jump: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V20" />,
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
    </>
  ),
  qr: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />,
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const filled = name === 'grip';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Small popover menu anchored to its trigger; closes on outside click / Escape. */
export function Menu({
  trigger,
  items,
  align = 'left',
  label,
}: {
  trigger: ReactNode;
  items: { label: string; hint?: string; onClick: () => void; danger?: boolean; disabled?: boolean }[];
  align?: 'left' | 'right';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={'glass-btn icon-btn' + (open ? ' is-open' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className={'menu menu--' + align} role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={'menu-item' + (it.danger ? ' danger' : '')}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              <span>{it.label}</span>
              {it.hint && <small>{it.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Text input that auto-sizes its width to content (for inline names). */
export function InlineName({
  value,
  onChange,
  readOnly,
  className = '',
  placeholder,
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      className={'inline-name ' + className}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
