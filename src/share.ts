/**
 * Share links: the whole project travels *inside* the URL fragment (#p=…), which
 * browsers never send to a server — nothing is uploaded anywhere.
 *
 * Payload: JSON → long ids shortened → deflate-raw → base64url.
 */
import type { Location } from './tax/regions';
import type { CardDef, Period, Scenario, ScenarioCard } from './types';

export const SHARE_PARAM = 'p';
const VERSION = 1;

export interface SharedProject {
  library: CardDef[];
  scenarios: Scenario[];
  location: Location;
  period: Period;
  stage: string[];
}

interface Wire {
  v: number;
  d: SharedProject;
}

/* ---------- id shortening (uuids are ~36 random chars that don't compress) ---------- */

function shortenIds(p: SharedProject): SharedProject {
  const map = new Map<string, string>();
  let n = 0;
  const id = (old: string) => {
    let v = map.get(old);
    if (!v) map.set(old, (v = (n++).toString(36)));
    return v;
  };
  const card = (d: CardDef): CardDef => ({ ...d, id: id(d.id), fields: d.fields.map((f) => ({ ...f, id: id(f.id) })) });
  const library = p.library.map(card);
  const scenarios = p.scenarios.map((s) => ({
    ...s,
    id: id(s.id),
    cards: s.cards.map((c): ScenarioCard => {
      const parentId = c.parentId ? id(c.parentId) : null;
      // A linked copy just mirrors its parent: don't ship the duplicate definition.
      const def = c.linked && parentId && library.some((l) => l.id === parentId) ? (null as unknown as CardDef) : card(c.def);
      return { ...c, id: id(c.id), parentId, def };
    }),
  }));
  return { ...p, library, scenarios, stage: p.stage.filter((x) => map.has(x)).map(id) };
}

/** Rebuild what shortenIds dropped (linked copies' definitions). */
function restore(p: SharedProject): SharedProject {
  const lib = new Map(p.library.map((c) => [c.id, c]));
  return {
    ...p,
    scenarios: p.scenarios.map((s) => ({
      ...s,
      variables: Array.isArray(s.variables) ? s.variables : [], // links made before scenario variables
      cards: s.cards.map((c) => {
        if (c.def) return c;
        const parent = c.parentId ? lib.get(c.parentId) : undefined;
        if (!parent) throw new Error('Shared project is incomplete');
        return { ...c, def: structuredClone(parent) };
      }),
    })),
  };
}

/* ---------- bytes ⇄ base64url, deflate ---------- */

const toB64Url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeProject(p: SharedProject): Promise<string> {
  const json = JSON.stringify({ v: VERSION, d: shortenIds(p) } satisfies Wire);
  return toB64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

export async function decodeProject(code: string): Promise<SharedProject> {
  const bytes = await pipe(fromB64Url(code), new DecompressionStream('deflate-raw'));
  const wire = JSON.parse(new TextDecoder().decode(bytes)) as Wire;
  if (wire?.v !== VERSION || !Array.isArray(wire.d?.library) || !Array.isArray(wire.d?.scenarios)) {
    throw new Error('This link is not a valid EDI project');
  }
  return restore(wire.d);
}

export function shareUrl(code: string): string {
  return `${location.origin}${location.pathname}#${SHARE_PARAM}=${code}`;
}

/** The share code in the current URL, if any. */
export function shareCodeFromUrl(): string | null {
  const m = new RegExp(`^#${SHARE_PARAM}=([A-Za-z0-9_-]+)$`).exec(location.hash);
  return m ? m[1] : null;
}

export function clearShareFromUrl() {
  history.replaceState(null, '', location.pathname + location.search);
}

/** QR code SVG (lazy-loaded library). Returns null when the link is too long for a QR code. */
export async function qrSvg(text: string): Promise<string | null> {
  const { default: qrcode } = await import('qrcode-generator');
  try {
    const qr = qrcode(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  } catch {
    return null; // "code length overflow"
  }
}
