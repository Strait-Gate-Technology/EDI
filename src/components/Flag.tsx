import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { scenarioLocation, useStore } from '../store';
import {
  COUNTRIES, DEFAULT_REGION, REGIONS, countryOf, flagId, locationSuffix, regionName,
  type Country, type Location,
} from '../tax/regions';
import type { Scenario } from '../types';
import { Icon } from './ui';

/** Tiny pre-rasterised flag (public/flags/*.webp, ~1 KB each). */
export const Flag = memo(function Flag({ id, title, size = 'sm' }: { id: string; title?: string; size?: 'sm' | 'md' }) {
  return (
    <img
      className={'flag flag--' + size}
      src={`/flags/${id}.webp`}
      alt={title ?? ''}
      title={title}
      width={size === 'sm' ? 18 : 24}
      height={size === 'sm' ? 12 : 16}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
});

interface Option {
  code: string;
  name: string;
  flag: string;
}

/** Pill button showing a flag; opens a searchable flag list. */
export function FlagSelect({
  value, options, onChange, label, disabled,
}: {
  value: string;
  options: Option[];
  onChange: (code: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.code === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.name.toLowerCase().includes(t) || o.code.toLowerCase() === t) : options;
  }, [q, options]);

  const pick = (code: string) => {
    setOpen(false);
    setQ('');
    if (code !== value) onChange(code);
  };

  return (
    <div className="menu-wrap flag-select" ref={ref}>
      <button
        type="button"
        className={'flag-pill' + (open ? ' is-open' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.name ?? value}`}
        title={`${label}: ${current?.name ?? value}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {current && <Flag id={current.flag} />}
        <Icon name="down" size={11} />
      </button>
      {open && (
        <div className="menu menu--left flag-menu" role="listbox" aria-label={label}>
          {options.length > 15 && (
            <input
              className="flag-search"
              placeholder={`Search ${options.length}…`}
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && shown[0] && pick(shown[0].code)}
            />
          )}
          <div className="flag-list" ref={listRef}>
            {shown.map((o) => (
              <button
                key={o.code}
                type="button"
                role="option"
                aria-selected={o.code === value}
                className={'menu-item flag-item' + (o.code === value ? ' is-current' : '')}
                onClick={() => pick(o.code)}
              >
                <Flag id={o.flag} />
                <span>{o.name}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="muted small" style={{ padding: 8 }}>No match</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const COUNTRY_OPTIONS: Option[] = COUNTRIES.map((c) => ({ code: c.code, name: c.name, flag: flagId(c.code) }));
const REGION_OPTIONS: Record<Country, Option[]> = {
  CA: REGIONS.CA.map((r) => ({ ...r, flag: flagId('CA', r.code) })),
  US: REGIONS.US.map((r) => ({ ...r, flag: flagId('US', r.code) })),
};

/** Nation pill + province/state pill. */
export function LocationPicker({
  value, onChange, prefer, labelPrefix = '',
}: {
  value: Location;
  onChange: (loc: Location) => void;
  /** Region to pick when switching to this location's country (e.g. the app default). */
  prefer?: Location;
  labelPrefix?: string;
}) {
  return (
    <div className="location-picker" role="group" aria-label={labelPrefix + 'Tax location'}>
      <FlagSelect
        label={labelPrefix + 'Nation'}
        value={value.country}
        options={COUNTRY_OPTIONS}
        onChange={(c) => {
          const country = c as Country;
          onChange({ country, region: prefer?.country === country ? prefer.region : DEFAULT_REGION[country] });
        }}
      />
      <FlagSelect
        label={labelPrefix + countryOf(value.country).regionWord}
        value={value.region}
        options={REGION_OPTIONS[value.country]}
        onChange={(region) => onChange({ country: value.country, region })}
      />
    </div>
  );
}

/** "(Ontario 🏳)" / "(U.S. 🏳, Maine 🏳)" — only when it differs from the app default. */
export function LocationSuffix({ loc }: { loc: Location }) {
  const global = useStore((s) => s.location);
  const parts = locationSuffix(loc, global);
  if (!parts) return null;
  return (
    <span className="loc-suffix">
      (
      {parts.map((p, i) => (
        <span key={p.flag} className="loc-part">
          {i > 0 && ', '}
          {p.label} <Flag id={p.flag} title={p.label} />
        </span>
      ))}
      )
    </span>
  );
}

export function ScenarioTitle({ scenario }: { scenario: Scenario }) {
  const global = useStore((s) => s.location);
  return (
    <>
      <span className="title-text">{scenario.name || 'Untitled'}</span>
      <LocationSuffix loc={scenarioLocation(scenario, global)} />
    </>
  );
}

export const locationLabel = (l: Location) => `${regionName(l.country, l.region)}, ${countryOf(l.country).short}`;
