import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { VALUE_ID, evaluateCard, fmtUnit, num, type FieldResult } from '../calc';
import { uid, useStore } from '../store';
import { FREQUENCIES, KIND_META, PER_YEAR, PERIODS, type CardDef } from '../types';
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
  /** Drag payload set when the grip is dragged. */
  drag?: { type: string; id: string };
  /** Drop handler for reordering (scenario cards). */
  dropAccept?: string;
  onDropBefore?: (draggedId: string) => void;
}

export function CardView(p: CardViewProps) {
  const { def, onChange } = p;
  const readOnly = !onChange;
  const meta = KIND_META[def.kind];
  const result = useMemo(() => evaluateCard(def), [def]);
  const period = useStore((s) => s.period);
  const periodMeta = PERIODS.find((x) => x.id === period)!;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [formulaFocus, setFormulaFocus] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

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
    const token = /^[A-Za-z_][A-Za-z0-9_ ]*$/.test(name) ? name : `[${name}]`;
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

  const menuItems = [
    { label: 'Variable…', hint: 'Named input value', onClick: () => addField('variable') },
    { label: 'Equation…', hint: 'Named =formula field', onClick: () => addField('equation') },
    {
      label: `${meta.label} from equation`,
      hint: 'Turn the final value into =formula',
      disabled: def.value.trim().startsWith('='),
      onClick: () => {
        const names = def.fields.map((f) => f.name.trim()).filter(Boolean);
        setExpr(VALUE_ID, '=' + (names.length ? names.join(' * ') : ''));
        setFocusId(VALUE_ID + ':expr');
      },
    },
  ];

  const onDragStart = (e: DragEvent) => {
    if (!p.drag) return;
    e.dataTransfer.setData(p.drag.type, p.drag.id);
    e.dataTransfer.setData('text/plain', def.name);
    e.dataTransfer.effectAllowed = p.context === 'library' ? 'copy' : 'move';
    if (cardRef.current) e.dataTransfer.setDragImage(cardRef.current, 24, 24);
    document.body.classList.add('dragging-' + def.kind);
  };
  const onDragEnd = () => document.body.classList.remove('dragging-' + def.kind);

  const accepts = (e: DragEvent) => !!p.dropAccept && e.dataTransfer.types.includes(p.dropAccept);

  const annualPerPeriod = result.value.error ? NaN : result.annual / periodMeta.perYear;
  const linkedRO = p.context === 'scenario' && p.linked;

  return (
    <div
      ref={cardRef}
      className={
        `card card--${def.kind} cycle` +
        (readOnly ? ' is-readonly' : '') +
        (result.hasError ? ' has-error' : '') +
        (dropHover ? ' drop-before' : '')
      }
      style={cycle(p.seed, 140, 420)}
      title={linkedRO ? 'Linked to its library card — edit the parent, or click the chain to unlink' : undefined}
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
          <Menu label="Add variable or equation" trigger={<Icon name="plus" size={14} />} items={menuItems} />
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
            <button type="button" className="tool" onClick={p.onQuickAdd} title={p.quickAddLabel} aria-label={p.quickAddLabel}>
              <Icon name="arrow" size={14} />
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
            onChange={(e) => onChange?.((d) => { d.frequency = e.target.value as CardDef['frequency']; })}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          {def.kind === 'income' && (
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
          <span className="per-period" title={`${num(result.value.value)} × ${PER_YEAR[def.frequency]}/yr`}>
            ≈ {fmtUnit(annualPerPeriod, meta.unit)}<small>/{periodMeta.short}</small>
          </span>
        </div>
      </div>

      {formulaFocus && !readOnly && def.fields.some((f) => f.name.trim()) && (
        <div className="name-chips" onMouseDown={(e) => e.preventDefault()}>
          <span>Insert:</span>
          {def.fields
            .filter((f) => f.name.trim() && f.id !== formulaFocus)
            .map((f) => (
              <button type="button" key={f.id} className="chip" onClick={() => insertName(f.name.trim())}>
                {f.name.trim()}
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

function FieldRow(props: {
  name: string;
  expr: string;
  role: 'variable' | 'equation';
  fieldId: string;
  result?: FieldResult;
  readOnly: boolean;
  unit: '$' | 'h' | null;
  focus: string | null;
  isFinal?: boolean;
  onFocusFormula: (id: string | null) => void;
  onName?: (v: string) => void;
  onExpr: (v: string) => void;
  onRemove?: () => void;
}) {
  const r = props.result;
  const nameRef = useRef<HTMLDivElement>(null);
  const exprRef = useRef<HTMLInputElement>(null);
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
          placeholder={props.role === 'equation' ? '=formula' : '0'}
          inputMode={isFormula ? 'text' : 'decimal'}
          spellCheck={false}
          data-field={props.fieldId}
          aria-label={`${props.name} value`}
          aria-invalid={!!r?.error}
          onFocus={(e) => props.onFocusFormula(e.target.value.trim().startsWith('=') ? props.fieldId : null)}
          onBlur={() => props.onFocusFormula(null)}
          onChange={(e) => {
            props.onExpr(e.target.value);
            props.onFocusFormula(e.target.value.trim().startsWith('=') ? props.fieldId : null);
          }}
        />
        {!props.readOnly && props.onRemove && (
          <button type="button" className="tool tool--danger field-remove" onClick={props.onRemove} aria-label={`Remove ${props.name}`} title="Remove field">
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
      {(r?.error || isFormula) && (
        <div className={'field-result' + (r?.error ? ' is-error' : '')}>
          {r?.error ? r.error : '= ' + (props.unit ? fmtUnit(r!.value, props.unit) : num(r!.value))}
        </div>
      )}
    </div>
  );
}
