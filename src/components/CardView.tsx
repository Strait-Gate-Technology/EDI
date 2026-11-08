import { memo, useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { VALUE_ID, evaluateCard, fmtUnit, money, nameToken, num, oneTimeProblem, type FieldResult, type Scope } from '../calc';
import { uid, useStore } from '../store';
import { FREQUENCIES, KIND_META, PER_YEAR, PERIODS, fmtDate, fmtPeriod, poiDays, type CardDef, type PeriodOfInterest } from '../types';
import { DRAG_PARENT, scrollAndFocus } from './hooks';
import { Icon, InlineName, Menu, cycle } from './ui';

export interface CardViewProps {
  def: CardDef;
  seed: string;
  context: 'library' | 'scenario';
  /** Scenario cards: still linked to the library parent? */
  linked?: boolean;
  /** Library cards: how many linked copies exist. */
  usage?: number;
  /** Absent → read-only. */
  onChange?: (fn: (d: CardDef) => void) => void;
  onRemove?: () => void;
  onUnlink?: () => void;
  onDuplicate?: () => void;
  onQuickAdd?: () => void;
  quickAddLabel?: string;
  /** Already linked in the open scenario: quick-add is shown disabled. */
  quickAddDisabled?: boolean;
  /** Scenario cards that are still linked: jump to the parent card in the library. */
  onJumpToParent?: () => void;
  /** Scenario cards: the scenario's evaluated variables. */
  scope?: Scope;
  /** Scenario cards: create the scenario variables this card needs but lacks. */
  onAddMissing?: (names: string[]) => void;
  /** Drag payload set when the grip is dragged. */
  drag?: { type: string; id: string };
  /** Drop handler for reordering (scenario cards). */
  dropAccept?: string;
  onDropBefore?: (draggedId: string) => void;
  /** Scenario cards: the scenario's Period of Interest (one-time cards are counted over it). */
  poi?: PeriodOfInterest | null;
  /** Scenario cards: show the scenario's Period of Interest picker. */
  onSetPeriod?: () => void;
  /** The frequency was just switched to One-time. */
  onOneTime?: () => void;
  /** Scenario cards: focus/scroll here when the store's focus target is this id. */
  focusKey?: string;
  /** Linked scenario cards: this scenario's own date (undefined = follow the library card, null = none). */
  dateOverride?: string | null;
  /** Linked scenario cards: the library card's date. */
  libraryDate?: string;
  /** Linked scenario cards: set this scenario's date instead of the library card's. */
  onDate?: (date: string | null | undefined) => void;
}

/**
 * Re-render only when data props change. Callbacks are recreated by parents on
 * every render but only close over ids / the data compared here.
 */
function sameProps(a: CardViewProps, b: CardViewProps) {
  for (const k of Object.keys(a) as (keyof CardViewProps)[]) {
    const x = a[k], y = b[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (k === 'drag') {
      if (a.drag?.id !== b.drag?.id || a.drag?.type !== b.drag?.type) return false;
      continue;
    }
    if (x !== y) return false;
  }
  return Object.keys(a).length === Object.keys(b).length;
}

export const CardView = memo(CardViewImpl, sameProps);

function CardViewImpl(p: CardViewProps) {
  const { def, onChange } = p;
  const readOnly = !onChange;
  const meta = KIND_META[def.kind];
  const result = useMemo(() => evaluateCard(def, p.scope), [def, p.scope]);
  const period = useStore((s) => s.period);
  const periodMeta = PERIODS.find((x) => x.id === period)!;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [formulaFocus, setFormulaFocus] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Jump to a freshly created card and select its name.
  const focusKey = p.focusKey ?? (p.context === 'library' ? def.id : null);
  const focusNonce = useStore((s) => (focusKey && s.focusTarget?.id === focusKey ? s.focusTarget.nonce : 0));
  const clearFocus = useStore((s) => s.clearFocus);
  useEffect(() => {
    if (!focusNonce || !focusKey) return;
    scrollAndFocus(cardRef.current, cardRef.current?.querySelector<HTMLInputElement>('.card-name'));
    clearFocus(focusKey);
  }, [focusNonce, focusKey, clearFocus]);

  const addField = (role: 'variable' | 'equation') => {
    if (!onChange) return;
    const id = uid();
    const base = role === 'variable' ? 'Variable' : 'Equation';
    const names = new Set(def.fields.map((f) => f.name.toLowerCase()));
    let n = 1;
    while (names.has(`${base} ${n}`.toLowerCase())) n++;
    onChange((d) => {
      d.fields.push({ id, name: `${base} ${n}`, expr: role === 'equation' ? '=' : '', role });
    });
    setFocusId(id + (role === 'equation' ? ':expr' : ':name'));
  };

  const setExpr = (fieldId: string, expr: string) =>
    onChange?.((d) => {
      if (fieldId === VALUE_ID) d.value = expr;
      else {
        const f = d.fields.find((x) => x.id === fieldId);
        if (f) f.expr = expr;
      }
    });

  const insertName = (name: string) => {
    const el = document.activeElement as HTMLInputElement | null;
    const fieldId = el?.dataset.field;
    if (!el || !fieldId) return;
    const token = nameToken(name);
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, s);
    const pad = before && !/[\s(=+\-*/^,]$/.test(before) ? ' ' : '';
    const next = before + pad + token + el.value.slice(e);
    setExpr(fieldId, next);
    requestAnimationFrame(() => {
      const pos = (before + pad + token).length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Equations: type "=" in any box.
  const menuItems = [{ label: 'Variable…', hint: 'Named value; type = for a formula', onClick: () => addField('variable') }];

  const onDragStart = (e: DragEvent) => {
    if (!p.drag) return;
    e.dataTransfer.setData(p.drag.type, p.drag.id);
    // Lets a scenario refuse a second linked copy while it's still being hovered.
    if (p.context === 'library') e.dataTransfer.setData(DRAG_PARENT(def.id), '1');
    e.dataTransfer.setData('text/plain', def.name);
    e.dataTransfer.effectAllowed = p.context === 'library' ? 'copy' : 'move';
    if (cardRef.current) e.dataTransfer.setDragImage(cardRef.current, 24, 24);
    document.body.classList.add('dragging-' + def.kind);
  };
  const onDragEnd = () => document.body.classList.remove('dragging-' + def.kind);

  const accepts = (e: DragEvent) => !!p.dropAccept && e.dataTransfer.types.includes(p.dropAccept);

  const annualPerPeriod = result.value.error || result.value.pending ? NaN : result.annual / periodMeta.perYear;
  // Names offered as insert chips: own fields, plus the scenario's variables.
  const chipNames = [
    ...def.fields.filter((f) => f.name.trim() && f.id !== formulaFocus).map((f) => f.name.trim()),
    ...(p.scope ? [...p.scope.byName.values()].map((v) => v.name) : []),
  ].filter((n, i, a) => a.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i);
  const fromScope = result.needs.filter((n) => !result.missing.includes(n));
  const linkedEdit = p.context === 'scenario' && p.linked && !readOnly;

  // Date of a one-time card. Linked scenario copies keep their own date per scenario.
  const scopedDate = !!p.onDate;
  const ov = p.dateOverride;
  const dateClear = scopedDate
    ? ov !== undefined || p.libraryDate
      ? {
          run: () => p.onDate!(ov !== undefined ? undefined : null),
          title:
            ov !== undefined
              ? p.libraryDate
                ? `Use the library card’s date (${fmtDate(p.libraryDate)})`
                : 'Use the library card’s default (start of the period)'
              : 'No date in this scenario: counts at the start of its period',
        }
      : null
    : def.date
      ? { run: () => onChange?.((d) => { delete d.date; }), title: 'Remove the date' }
      : null;

  // One-time (lump sum) cards.
  const once = def.frequency === 'once' && def.kind !== 'hours';
  const inScenario = p.context === 'scenario';
  const days = inScenario ? poiDays(p.poi) : null;
  const problem = once && inScenario ? oneTimeProblem(def, p.poi) : null;
  const verb = def.kind === 'expense' ? 'Paid' : 'Received';
  const lump = result.value.error || result.value.pending ? NaN : result.oneTime;
  const lumpPerPeriod = days ? (lump * 365) / days / periodMeta.perYear : NaN;
  const freqs = FREQUENCIES.filter((f) => f.id !== 'once' || def.kind !== 'hours');

  return (
    <div
      ref={cardRef}
      className={
        `card card--${def.kind} cycle` +
        (readOnly ? ' is-readonly' : '') +
        (result.hasError || problem ? ' has-error' : '') +
        (result.value.pending ? ' is-pending' : '') +
        (dropHover ? ' drop-before' : '')
      }
      style={cycle(p.seed, 140, 420)}
      title={linkedEdit ? 'Linked: edits also change the library card and its other copies. Click the chain to unlink.' : undefined}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setDropHover(true);
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropHover(false);
        p.onDropBefore?.(e.dataTransfer.getData(p.dropAccept!));
      }}
    >
      <div className="card-head">
        {readOnly ? (
          <span className="type-badge" aria-hidden="true">{badge(def.kind)}</span>
        ) : (
          <Menu label="Add variable" trigger={<Icon name="plus" size={14} />} items={menuItems} />
        )}
        <InlineName
          className="card-name"
          value={def.name}
          readOnly={readOnly}
          ariaLabel={`${meta.label} card name`}
          onChange={(v) => onChange?.((d) => { d.name = v; })}
        />
        <div className="card-tools">
          {p.drag && (
            <span
              className="grip"
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              title={p.context === 'library' ? 'Drag into a scenario' : 'Drag to reorder'}
              aria-label="Drag handle"
            >
              <Icon name="grip" size={14} />
            </span>
          )}
          {p.onQuickAdd && (
            <button
              type="button"
              className="tool quick-add"
              onClick={p.onQuickAdd}
              disabled={p.quickAddDisabled}
              title={p.quickAddLabel}
              aria-label={p.quickAddLabel}
            >
              <Icon name="arrow" size={14} />
            </button>
          )}
          {p.onJumpToParent && (
            <button type="button" className="tool jump" onClick={p.onJumpToParent} title="Edit the parent card in the library" aria-label="Jump to parent card in library">
              <Icon name="jump" size={14} />
            </button>
          )}
          {p.onDuplicate && (
            <button type="button" className="tool" onClick={p.onDuplicate} title="Duplicate card" aria-label="Duplicate card">
              <Icon name="copy" size={14} />
            </button>
          )}
          {p.onRemove && (
            <button type="button" className="tool tool--danger" onClick={p.onRemove} title="Remove card" aria-label="Remove card">
              <Icon name="x" size={14} />
            </button>
          )}
          {p.context === 'scenario' ? (
            <button
              type="button"
              className={'chain' + (p.linked ? ' is-linked' : ' is-broken')}
              disabled={!p.linked}
              onClick={p.onUnlink}
              title={p.linked ? 'Linked to library card — click to disconnect' : 'Unlinked (re-drag from the library to link again)'}
              aria-label={p.linked ? 'Disconnect from parent card' : 'Unlinked'}
            >
              <Icon name={p.linked ? 'link' : 'unlink'} size={14} />
            </button>
          ) : (
            <span
              className={'chain is-parent' + (p.usage ? ' is-used' : '')}
              title={p.usage ? `Linked in ${p.usage} scenario card${p.usage > 1 ? 's' : ''}` : 'Not used in any scenario yet'}
            >
              <Icon name="link" size={13} />
              {!!p.usage && <b>{p.usage}</b>}
            </span>
          )}
        </div>
      </div>

      {result.needs.length > 0 && (
        <div className="needs">
          {p.context === 'library' ? (
            <span className="needs-label" title="Each scenario sets these in its Variables zone. Adding this card to a scenario creates any that are missing.">
              <Icon name="variable" size={12} /> Per scenario:
            </span>
          ) : (
            <span className="needs-label" title="Values come from this scenario's Variables zone">
              <Icon name="variable" size={12} /> From scenario:
            </span>
          )}
          {(p.context === 'library' ? result.needs : fromScope).map((n) => (
            <span key={n} className="var-chip">{n}</span>
          ))}
          {p.context === 'scenario' && result.missing.length > 0 && p.onAddMissing && (
            <button type="button" className="var-chip var-chip--add" onClick={() => p.onAddMissing!(result.missing)}>
              <Icon name="plus" size={11} /> Add {result.missing.join(', ')} to scenario
            </button>
          )}
        </div>
      )}

      {def.fields.length > 0 && (
        <div className="fields">
          {def.fields.map((f) => (
            <FieldRow
              key={f.id}
              name={f.name}
              expr={f.expr}
              role={f.role}
              fieldId={f.id}
              result={result.fields.get(f.id)}
              readOnly={readOnly}
              unit={null}
              focus={focusId}
              names={chipNames.filter((n) => n.toLowerCase() !== f.name.trim().toLowerCase())}
              onFocusFormula={setFormulaFocus}
              onName={(v) => onChange?.((d) => { const x = d.fields.find((y) => y.id === f.id); if (x) x.name = v; })}
              onExpr={(v) => setExpr(f.id, v)}
              onRemove={() => onChange?.((d) => { d.fields = d.fields.filter((y) => y.id !== f.id); })}
            />
          ))}
        </div>
      )}

      <div className="final">
        <FieldRow
          name={meta.valueLabel}
          expr={def.value}
          role="variable"
          fieldId={VALUE_ID}
          result={result.value}
          readOnly={readOnly}
          unit={meta.unit}
          focus={focusId}
          names={chipNames}
          onFocusFormula={setFormulaFocus}
          onExpr={(v) => setExpr(VALUE_ID, v)}
          isFinal
        />
        <div className="final-opts">
          <select
            className="glass-select"
            value={def.frequency}
            disabled={readOnly}
            aria-label="Frequency"
            onChange={(e) => {
              const f = e.target.value as CardDef['frequency'];
              onChange?.((d) => { d.frequency = f; });
              if (f === 'once') p.onOneTime?.();
            }}
          >
            {freqs.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          {once && (
            <DatePill
              date={def.date}
              verb={verb}
              readOnly={readOnly}
              bad={problem === 'out-of-period'}
              min={inScenario && days ? p.poi!.start : undefined}
              max={inScenario && days ? p.poi!.end : undefined}
              onSet={(v) => (scopedDate ? p.onDate!(v) : onChange?.((d) => { d.date = v; }))}
              clear={dateClear}
              scoped={scopedDate && ov !== undefined}
              emptyLabel={scopedDate && ov === null ? 'Period start' : undefined}
              hint={
                scopedDate
                  ? `This scenario only. Library card: ${p.libraryDate ? fmtDate(p.libraryDate) : 'no date (start of the period)'}`
                  : undefined
              }
            />
          )}
          {once && def.kind === 'income' && (
            <span className="not-taxed" title="One-time amounts aren’t taxed yet">Not taxed</span>
          )}
          {def.kind === 'income' && !once && (
            <select
              className="glass-select"
              value={def.taxable ? 'taxable' : 'non'}
              disabled={readOnly}
              aria-label="Tax treatment"
              onChange={(e) => onChange?.((d) => { d.taxable = e.target.value === 'taxable'; })}
            >
              <option value="taxable">Taxable</option>
              <option value="non">Non-taxable</option>
            </select>
          )}
          {once ? (
            <span className="per-period" title={days ? `${money(lump)} spread over ${days} days` : 'A single lump sum'}>
              One-time {money(lump)}
              {days != null && !problem && Number.isFinite(lumpPerPeriod) && (
                <> · ≈ {money(lumpPerPeriod)}<small>/{periodMeta.short}</small></>
              )}
            </span>
          ) : (
            <span className="per-period" title={`${num(result.value.value)} × ${PER_YEAR[def.frequency]}/yr`}>
              ≈ {fmtUnit(annualPerPeriod, meta.unit)}<small>/{periodMeta.short}</small>
            </span>
          )}
        </div>
      </div>

      {once && (problem || !def.date) && (
        <div className={'when-note' + (problem ? ' is-error' : '')}>
          {!inScenario ? (
            'No date: counts at the start of each scenario’s Period of Interest'
          ) : problem === 'needs-period' ? (
            <>
              <span>⚠ Needs this scenario’s Period of Interest to be counted</span>
              {p.onSetPeriod && (
                <button type="button" className="link-btn" onClick={p.onSetPeriod}>Set period</button>
              )}
            </>
          ) : problem === 'out-of-period' ? (
            <span>
              ⚠ {fmtDate(def.date)} is outside this scenario’s period ({fmtPeriod(p.poi!)}); not counted.{' '}
Change the date or the period.
            </span>
          ) : (
            `${verb} at the start of the period (${fmtDate(p.poi?.start)})`
          )}
        </div>
      )}

      {formulaFocus && !readOnly && chipNames.length > 0 && (
        <div className="name-chips" onMouseDown={(e) => e.preventDefault()}>
          <span>Insert:</span>
          {chipNames.map((n) => (
            <button type="button" key={n} className="chip" onClick={() => insertName(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function badge(kind: CardDef['kind']) {
  return kind === 'income' ? '+$' : kind === 'expense' ? '−$' : <Icon name="clock" size={13} />;
}

interface Suggest {
  items: string[];
  i: number;
  /** Replace value[start, end) with the chosen name. */
  start: number;
  end: number;
}

/** Names that complete the token being typed just before the caret of an =formula. */
function suggest(value: string, caret: number, names: string[]): Suggest | null {
  if (!value.trimStart().startsWith('=') || !names.length) return null;
  const before = value.slice(0, caret);
  let start: number;
  let tok: string;
  const br = /\[([^\]]*)$/.exec(before);
  if (br) {
    start = br.index;
    tok = br[1];
  } else {
    const m = /[A-Za-z_][A-Za-z0-9_ ]*$/.exec(before);
    if (!m) return null;
    start = m.index;
    tok = m[0];
  }
  const t = tok.trim().toLowerCase();
  if (!t) return null;
  const pool = names.filter((n) => n.toLowerCase() !== t);
  const prefix = pool.filter((n) => n.toLowerCase().startsWith(t));
  const word = pool.filter((n) => !prefix.includes(n) && n.toLowerCase().split(/[\s_]+/).some((w) => w.startsWith(t)));
  const items = [...prefix, ...word].slice(0, 6);
  return items.length ? { items, i: 0, start, end: caret } : null;
}

export function FieldRow(props: {
  name: string;
  expr: string;
  role: 'variable' | 'equation';
  fieldId: string;
  result?: FieldResult;
  readOnly: boolean;
  unit: '$' | 'h' | null;
  focus: string | null;
  isFinal?: boolean;
  /** Names offered by autocomplete while typing an =formula. */
  names?: string[];
  onFocusFormula: (id: string | null) => void;
  onName?: (v: string) => void;
  onExpr: (v: string) => void;
  onRemove?: () => void;
  /** Placeholder for the value input. */
  placeholder?: string;
}) {
  const r = props.result;
  const nameRef = useRef<HTMLDivElement>(null);
  const exprRef = useRef<HTMLInputElement>(null);
  const [ac, setAc] = useState<Suggest | null>(null);
  const listId = useId();
  useEffect(() => {
    if (props.focus === props.fieldId + ':expr') {
      exprRef.current?.focus();
      const n = exprRef.current?.value.length ?? 0;
      exprRef.current?.setSelectionRange(n, n);
    } else if (props.focus === props.fieldId + ':name') {
      const el = nameRef.current?.querySelector('input');
      el?.focus();
      el?.select();
    }
  }, [props.focus, props.fieldId]);
  const isFormula = props.expr.trim().startsWith('=');

  const accept = (name: string) => {
    const el = exprRef.current;
    if (!el || !ac) return;
    const v = el.value;
    let end = ac.end;
    const bracket = v[ac.start] === '[';
    if (bracket && v[end] === ']') end++;
    const ins = bracket ? `[${name}]` : nameToken(name);
    props.onExpr(v.slice(0, ac.start) + ins + v.slice(end));
    setAc(null);
    const pos = ac.start + ins.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className={'field' + (props.isFinal ? ' field--final' : '') + (r?.error ? ' field--error' : '') + (isFormula ? ' field--formula' : '')}>
      <div className="field-label-wrap" ref={nameRef}>
      {props.isFinal ? (
        <label className="field-label" htmlFor={props.fieldId + props.name}>{props.name}</label>
      ) : (
        <InlineName
          className="field-name"
          value={props.name}
          readOnly={props.readOnly}
          ariaLabel="Variable name"
          placeholder="Name"
          onChange={(v) => props.onName?.(v)}
        />
      )}
      </div>
      <div className="field-input-wrap">
        <input
          ref={exprRef}
          id={props.isFinal ? props.fieldId + props.name : undefined}
          className="field-input"
          value={props.expr}
          readOnly={props.readOnly}
          placeholder={props.placeholder ?? (props.role === 'equation' ? '=formula' : '0')}
          inputMode={isFormula ? 'text' : 'decimal'}
          spellCheck={false}
          autoComplete="off"
          data-field={props.fieldId}
          aria-label={`${props.name} value`}
          aria-invalid={!!r?.error}
          aria-autocomplete="list"
          aria-expanded={!!ac}
          aria-controls={ac ? listId : undefined}
          aria-activedescendant={ac ? `${listId}-${ac.i}` : undefined}
          onFocus={(e) => props.onFocusFormula(e.target.value.trim().startsWith('=') ? props.fieldId : null)}
          onBlur={() => {
            setAc(null);
            props.onFocusFormula(null);
          }}
          onChange={(e) => {
            const el = e.target;
            props.onExpr(el.value);
            props.onFocusFormula(el.value.trim().startsWith('=') ? props.fieldId : null);
            const caret = el.selectionStart ?? el.value.length;
            setAc(el.selectionEnd === caret && props.names ? suggest(el.value, caret, props.names) : null);
          }}
          onKeyDown={(e) => {
            if (!ac) return;
            const n = ac.items.length;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setAc({ ...ac, i: (ac.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              accept(ac.items[ac.i]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setAc(null);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
              setAc(null);
            }
          }}
        />
        {ac && (
          <ul className="ac-list" id={listId} role="listbox" aria-label="Matching names">
            {ac.items.map((n, i) => (
              <li
                key={n}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === ac.i}
                className={'ac-item' + (i === ac.i ? ' is-active' : '')}
                // Keep focus (and the mobile keyboard) on the input.
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => accept(n)}
              >
                {n}
              </li>
            ))}
          </ul>
        )}
        {!props.readOnly && props.onRemove && (
          <button type="button" className="tool tool--danger field-remove" onClick={props.onRemove} aria-label={`Remove ${props.name}`} title="Remove field">
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
      {(r?.error || isFormula) && (
        <div className={'field-result' + (r?.error ? ' is-error' : r?.pending ? ' is-pending' : '')}>
          {r?.error
            ? r.error
            : r?.pending
              ? 'Set per scenario'
              : '= ' + (props.unit ? fmtUnit(r!.value, props.unit) : num(r!.value))}
        </div>
      )}
    </div>
  );
}

/** Optional date of a one-time card: a compact pill that turns into a date input only while editing. */
function DatePill(p: {
  date?: string;
  verb: string;
  readOnly: boolean;
  bad: boolean;
  min?: string;
  max?: string;
  onSet: (iso: string | undefined) => void;
  /** The × button, when there is something to clear. */
  clear?: { run: () => void; title: string } | null;
  /** The date is this scenario's own (not the library card's). */
  scoped?: boolean;
  /** Pill text when there's no date. */
  emptyLabel?: string;
  /** Extra tooltip line. */
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      pillRef.current?.focus();
    }
  }, [editing]);

  const label = p.date ? fmtDate(p.date) : '';
  if (p.readOnly) {
    if (!label) return null;
    return (
      <span className={'flag-pill date-pill is-static' + (p.bad ? ' is-bad' : '')} title={`Date ${p.verb.toLowerCase()}`}>
        <Icon name="calendar" size={12} />
        {label}
      </span>
    );
  }
  if (editing) {
    return (
      <input
        type="date"
        className="glass-select date-input"
        value={p.date ?? ''}
        min={p.min}
        max={p.max}
        autoFocus
        aria-label={`Date ${p.verb.toLowerCase()} (optional)`}
        ref={(el) => {
          if (!el || el.dataset.opened) return;
          el.dataset.opened = '1';
          try { el.showPicker(); } catch { /* not supported or not allowed */ }
        }}
        onChange={(e) => p.onSet(e.target.value || undefined)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') {
            e.preventDefault();
            refocus.current = true;
            setEditing(false);
          }
        }}
      />
    );
  }
  const base = label
    ? `Date ${p.verb.toLowerCase()} — click to change`
    : 'Optional. Without a date it counts at the start of the scenario’s Period of Interest.';
  return (
    <span className="date-pill-wrap">
      <button
        ref={pillRef}
        type="button"
        className={'flag-pill date-pill' + (label || p.emptyLabel ? '' : ' is-empty') + (p.bad ? ' is-bad' : '') + (p.scoped ? ' is-scoped' : '')}
        title={p.hint ? `${base}\n${p.hint}` : base}
        onClick={() => setEditing(true)}
      >
        <Icon name="calendar" size={12} />
        {label || p.emptyLabel || 'Add date'}
        {p.scoped && <small className="date-pill-scope">this scenario</small>}
      </button>
      {p.clear && (
        <button type="button" className="date-pill-clear" title={p.clear.title} aria-label={p.clear.title} onClick={p.clear.run}>
          <Icon name="x" size={10} />
        </button>
      )}
    </span>
  );
}
