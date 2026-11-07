import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { shareCodeFromUrl } from '../share';
import { FIRST_VISIT, markWelcomed, useStore } from '../store';
import { useIsMobile } from './hooks';

/* ---------------- Guided tour: a few anchored tooltips over the real UI ---------------- */

interface Step {
  /** CSS selector of the element to spotlight. */
  target: (mobile: boolean) => string;
  title: string;
  body: string;
  /** Bring the target on screen (view / mobile pane). */
  prep: (mobile: boolean) => void;
}

const build = (pane?: 'library' | 'scenario') => (mobile: boolean) => {
  const s = useStore.getState();
  if (s.view !== 'build') s.setView('build');
  if (mobile && pane && s.mobilePane !== pane) s.setMobilePane(pane);
};

const STEPS: Step[] = [
  {
    target: () => '.library',
    title: 'Build your cards',
    body: 'The library holds reusable Income, Expense and Hours cards. A value can be a number or a formula such as =Rate * Hours per week. A name the card doesn’t define, like Distance, is filled in by each scenario.',
    prep: build('library'),
  },
  {
    target: () => '.new-scenario',
    title: 'Add a scenario',
    body: 'A scenario is one option you’re weighing: a job offer, a commute, a contract. Create as many as you like; each gets a tab up here showing its EDI per hour.',
    prep: build('scenario'),
  },
  {
    target: () => '.workspace',
    title: 'Fill it with cards',
    body: 'Drag library cards by their grip into the matching zone: Incomes, Expenses, Hours. Copies stay linked to the library until you unlink them. The Variables zone holds values that differ per scenario.',
    prep: build('scenario'),
  },
  {
    target: () => '.topbar-right .location-picker',
    title: 'Set your tax location',
    body: 'Taxable income is taxed with 2026 federal and provincial or state brackets. The default is New Brunswick, Canada; pick yours here, or override it for a single scenario.',
    prep: build(),
  },
  {
    target: (mobile) => (mobile ? '.mobile-nav button:last-child' : '.analysis-btn'),
    title: 'Compare',
    body: 'Analysis lines scenarios up side by side by EDI per hour — what you keep for each hour an option costs you — with Total EDI beside it. Want an example to explore? ☰ → Load sample data.',
    prep: build(),
  },
];

const useTour = create<{ step: number | null }>(() => ({ step: null }));

export function startTour() {
  useTour.setState({ step: 0 });
}
const endTour = () => useTour.setState({ step: null });
const go = (d: number) =>
  useTour.setState((s) => {
    if (s.step == null) return s;
    const n = s.step + d;
    return { step: n < 0 ? 0 : n >= STEPS.length ? null : n };
  });

interface Box { x: number; y: number; w: number; h: number }
const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

const PAD = 6; // spotlight padding around the target
const GAP = 12; // spotlight → tooltip
const EDGE = 8; // tooltip ↔ viewport

export function Tour() {
  const step = useTour((s) => s.step);
  const mobile = useIsMobile();
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Prepare the screen, then follow the target every frame (layout shifts, scrolling, resizes).
  useEffect(() => {
    if (step == null) return;
    const s = STEPS[step];
    s.prep(mobile);
    let scrolled = false;
    let raf = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(s.target(mobile));
      if (el && !scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const r = el?.getBoundingClientRect();
      const b = r && r.width > 0 ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null;
      setBox((prev) => (sameBox(prev, b) ? prev : b));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step, mobile]);

  // Place the tooltip beside the spotlight: below, above, right, left, else over it.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (step == null || !tip) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - tw - EDGE));
    const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - th - EDGE));
    if (!box) {
      setPos({ left: (vw - tw) / 2, top: (vh - th) / 2 });
      return;
    }
    // Visible part of the target.
    const l = Math.max(0, box.x - PAD);
    const t = Math.max(0, box.y - PAD);
    const r = Math.min(vw, box.x + box.w + PAD);
    const b = Math.min(vh, box.y + box.h + PAD);
    const cx = (l + r) / 2;
    const cy = (t + b) / 2;
    let p: { left: number; top: number };
    if (b + GAP + th <= vh - EDGE) p = { left: clampX(cx - tw / 2), top: b + GAP };
    else if (t - GAP - th >= EDGE) p = { left: clampX(cx - tw / 2), top: t - GAP - th };
    else if (r + GAP + tw <= vw - EDGE) p = { left: r + GAP, top: clampY(cy - th / 2) };
    else if (l - GAP - tw >= EDGE) p = { left: l - GAP - tw, top: clampY(cy - th / 2) };
    else p = { left: clampX(cx - tw / 2), top: clampY(cy - th / 2) };
    setPos((prev) => (prev && prev.left === p.left && prev.top === p.top ? prev : p));
  }, [box, step]);

  useEffect(() => {
    if (step == null) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [step]);

  if (step == null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="tour" role="presentation">
      {/* Swallows clicks so the tour isn't derailed mid-way. */}
      <div className={'tour-blocker' + (box ? '' : ' is-dim')} />
      {box && (
        <div
          className="tour-spot"
          style={{ left: box.x - PAD, top: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2 }}
        />
      )}
      <div
        ref={tipRef}
        className="tour-tip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      >
        <div className="tour-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} />
          ))}
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-body">{s.body}</p>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={endTour}>
              Skip tour
            </button>
          )}
          <span className="spacer" />
          {step > 0 && (
            <button type="button" className="glass-btn small" onClick={() => go(-1)}>
              Back
            </button>
          )}
          <button ref={nextRef} type="button" className="glass-btn small dialog-ok" onClick={() => go(1)}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- First-visit welcome ---------------- */

export function Welcome() {
  // Someone arriving from a share link gets the import dialog instead.
  const [open, setOpen] = useState(() => FIRST_VISIT && !shareCodeFromUrl());
  const tourRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (FIRST_VISIT && !open) markWelcomed();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    tourRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop welcome-backdrop">
      <div className="dialog welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-body">
        <div className="welcome-orb cycle" aria-hidden="true" />
        <h2 id="welcome-title">Welcome to EDI</h2>
        <div id="welcome-body">
          <p>
            <strong>Equivalent Disposable Income</strong> compares jobs, commutes and other life choices by what
            you actually keep for each hour they cost you:
          </p>
          <p className="welcome-formula">
            EDI / hour = (net income − expenses) ÷ hours
          </p>
          <p>You’re starting with a blank slate. Tax is set to New Brunswick, Canada; you can change it any time.</p>
        </div>
        <div className="welcome-actions">
          <button type="button" className="glass-btn" onClick={() => setOpen(false)}>
            Get started
          </button>
          <button
            ref={tourRef}
            type="button"
            className="glass-btn dialog-ok"
            onClick={() => {
              setOpen(false);
              startTour();
            }}
          >
            Take the tour
          </button>
        </div>
      </div>
    </div>
  );
}
