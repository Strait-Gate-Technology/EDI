/**
 * Tiny spreadsheet-style formula evaluator.
 *
 *   =Fuel Price * Distance / 100 * 10.5
 *   =[Hours per week] * 52
 *   =max(0, Salary - 12%)            (postfix % divides by 100)
 *
 * Variable names may contain spaces; they are matched longest-first,
 * case-insensitively. `[Name]` brackets work for any name.
 */

export class FormulaError extends Error {}

export class CycleError extends FormulaError {
  constructor(public ids: string[], names: string[]) {
    super('Circular reference: ' + names.join(' → '));
  }
}

export interface NameRef {
  id: string;
  name: string;
  lower: string;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (x) => Math.abs(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  sqrt: (x) => Math.sqrt(x),
  pow: (x, y) => Math.pow(x, y),
  round: (x, d = 0) => {
    const f = 10 ** d;
    return Math.round(x * f) / f;
  },
};

export const FUNCTION_NAMES = Object.keys(FUNCS);

type Tok =
  | { t: 'num'; v: number }
  | { t: 'ref'; id: string; name: string }
  | { t: 'fn'; name: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

const WORD = /[A-Za-z0-9_]/;

function tokenize(src: string, names: NameRef[], onUnknown?: (name: string) => void): Tok[] {
  const out: Tok[] = [];
  const lower = src.toLowerCase();
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c) || c === '$') {
      i++;
      continue;
    }
    if (c === '[') {
      const j = src.indexOf(']', i);
      if (j < 0) throw new FormulaError('Missing closing ]');
      const nm = src.slice(i + 1, j).trim().toLowerCase();
      const ref = names.find((n) => n.lower === nm);
      if (!ref) {
        if (!onUnknown) throw new FormulaError(`Unknown variable "${src.slice(i + 1, j).trim()}"`);
        onUnknown(src.slice(i + 1, j).trim());
        out.push({ t: 'num', v: 0 });
      } else out.push({ t: 'ref', id: ref.id, name: ref.name });
      i = j + 1;
      continue;
    }
    // Known variable names first (longest match, word boundary).
    let matched: NameRef | undefined;
    for (const n of names) {
      if (!lower.startsWith(n.lower, i)) continue;
      const after = src[i + n.lower.length];
      const endsWord = WORD.test(n.lower[n.lower.length - 1]);
      if (after === undefined || !endsWord || !WORD.test(after)) {
        matched = n;
        break;
      }
    }
    if (matched) {
      out.push({ t: 'ref', id: matched.id, name: matched.name });
      i += matched.lower.length;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new FormulaError(`Bad number near "${src.slice(i, i + 6)}"`);
      out.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if ('+-*/^%'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '×') { out.push({ t: 'op', v: '*' }); i++; continue; }
    if (c === '÷') { out.push({ t: 'op', v: '/' }); i++; continue; }
    if (c === '(') { out.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { out.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { out.push({ t: 'comma' }); i++; continue; }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (m) {
      const rest = src.slice(i + m[0].length).trimStart();
      if (rest.startsWith('(') && FUNCS[m[0].toLowerCase()]) {
        out.push({ t: 'fn', name: m[0].toLowerCase() });
        i += m[0].length;
        continue;
      }
      // Grab the whole phrase for a friendlier message.
      const phrase = /^[A-Za-z_][A-Za-z0-9_ ]*/.exec(src.slice(i))![0].trim();
      if (!onUnknown) throw new FormulaError(`Unknown variable "${phrase}"`);
      onUnknown(phrase);
      out.push({ t: 'num', v: 0 });
      i += phrase.length;
      continue;
    }
    throw new FormulaError(`Unexpected "${c}"`);
  }
  return out;
}

function describe(t: Tok | undefined): string {
  if (!t) return 'end of formula';
  switch (t.t) {
    case 'num': return String(t.v);
    case 'ref': return `"${t.name}"`;
    case 'fn': return t.name;
    case 'op': return `"${t.v}"`;
    case 'lp': return '"("';
    case 'rp': return '")"';
    case 'comma': return '","';
  }
}

export function evaluateFormula(
  src: string,
  names: NameRef[],
  resolve: (id: string) => number,
): number {
  const toks = tokenize(src, names);
  if (toks.length === 0) throw new FormulaError('Formula is empty');
  let p = 0;
  const isOp = (v: string) => {
    const t = toks[p];
    return t?.t === 'op' && t.v === v;
  };
  const expect = (kind: Tok['t']) => {
    const t = toks[p];
    if (t?.t !== kind) throw new FormulaError(`Expected ${kind === 'rp' ? '")"' : kind === 'lp' ? '"("' : kind} but found ${describe(t)}`);
    p++;
  };

  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const o = (toks[p++] as { v: string }).v;
      const r = term();
      v = o === '+' ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = unary();
    while (isOp('*') || isOp('/')) {
      const o = (toks[p++] as { v: string }).v;
      const r = unary();
      if (o === '/') {
        if (r === 0) throw new FormulaError('Division by zero');
        v /= r;
      } else v *= r;
    }
    return v;
  }
  function unary(): number {
    if (isOp('-')) { p++; return -unary(); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power(): number {
    const b = postfix();
    if (isOp('^')) { p++; return b ** unary(); }
    return b;
  }
  function postfix(): number {
    let v = primary();
    while (isOp('%')) { p++; v /= 100; }
    return v;
  }
  function primary(): number {
    const t = toks[p++];
    if (!t) throw new FormulaError('Formula ends unexpectedly');
    switch (t.t) {
      case 'num': return t.v;
      case 'ref': return resolve(t.id);
      case 'lp': {
        const v = expr();
        expect('rp');
        return v;
      }
      case 'fn': {
        expect('lp');
        const args: number[] = [];
        if (toks[p]?.t !== 'rp') {
          args.push(expr());
          while (toks[p]?.t === 'comma') { p++; args.push(expr()); }
        }
        expect('rp');
        if (args.length === 0) throw new FormulaError(`${t.name}() needs an argument`);
        return FUNCS[t.name](...args);
      }
      default:
        throw new FormulaError(`Unexpected ${describe(t)}`);
    }
  }

  const v = expr();
  if (p < toks.length) throw new FormulaError(`Unexpected ${describe(toks[p])}`);
  if (!Number.isFinite(v)) throw new FormulaError('Result is not a finite number');
  return v;
}

/**
 * Names a formula uses that aren't in `names` (e.g. scenario variables a library card
 * expects). Never throws; a malformed formula just yields what could be read.
 */
export function freeNames(src: string, names: NameRef[]): string[] {
  const found = new Map<string, string>();
  try {
    tokenize(src, names, (n) => { if (n && !found.has(n.toLowerCase())) found.set(n.toLowerCase(), n); });
  } catch { /* syntax errors are reported by evaluateFormula */ }
  return [...found.values()];
}

/** Parse a direct-entry value: "1,200", "$45.50", "12%" … Empty → 0. */
export function parsePlain(src: string): number {
  let s = src.replace(/[$,\s]/g, '');
  if (s === '') return 0;
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  const v = Number(s);
  if (!Number.isFinite(v)) throw new FormulaError('Not a number — start with "=" for a formula');
  return pct ? v / 100 : v;
}
