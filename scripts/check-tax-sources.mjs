#!/usr/bin/env node
/**
 * Quarterly re-check of the official tax sources behind src/tax/tax-data.json.
 *
 * For every source it downloads the page and confirms the bracket thresholds we ship
 * still appear there, and watches for a newer edition / tax year. The outcome is written
 * to public/tax-status.json, which the app reads to decide whether to show a soft
 * "tax brackets may be out of date" notice. It never edits tax-data.json itself:
 * a failed check means a human should review and update the numbers.
 *
 *   node scripts/check-tax-sources.mjs            # writes public/tax-status.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'src/tax/tax-data.json'), 'utf8'));
const UA = 'EDI-tax-source-check/1.0 (+https://github.com/Strait-Gate-Technology/EDI)';

const normalise = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#8239;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/(\d)[,   ](?=\d{3}(?!\d))/g, '$1') // 58,523 / 58 523 → 58523
    .replace(/\s+/g, ' ');

async function check(src) {
  const base = { id: src.id, label: src.label, url: src.url, required: src.required, note: src.note };
  let text;
  try {
    const res = await fetch(src.url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/csv,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { ...base, status: 'unreachable', detail: `HTTP ${res.status}` };
    text = normalise(await res.text());
  } catch (e) {
    return { ...base, status: 'unreachable', detail: String(e?.message ?? e) };
  }
  const missing = src.expect.filter((n) => !text.includes(normalise(n)));
  if (missing.length) return { ...base, status: 'mismatch', missing };
  if (src.newerEditionPattern) {
    const re = new RegExp(src.newerEditionPattern.replace('{next}', String(data.year + 1)).replace(/ /g, '\s*'), 'i');
    if (re.test(text)) return { ...base, status: 'newer', detail: `Source mentions an edition for ${data.year + 1}` };
  }
  return { ...base, status: 'ok' };
}

const sources = [];
for (const src of data.sources) sources.push(await check(src));

const problems = [];
const nowYear = new Date().getUTCFullYear();
if (nowYear > data.year) problems.push(`Bundled brackets are for ${data.year}; it is now ${nowYear}.`);
for (const s of sources) {
  if (s.status === 'ok') continue;
  if (!s.required && s.status === 'unreachable') continue; // known to block automated checks
  problems.push(`${s.label}: ${s.status}${s.missing ? ' (missing ' + s.missing.join(', ') + ')' : s.detail ? ' (' + s.detail + ')' : ''}`);
}

const status = {
  checkedAt: new Date().toISOString(),
  dataYear: data.year,
  ok: problems.length === 0,
  problems,
  sources,
};
writeFileSync(join(root, 'public/tax-status.json'), JSON.stringify(status, null, 2) + '\n');
console.log(status.ok ? 'All tax sources verified.' : 'Tax source check found problems:\n- ' + problems.join('\n- '));
for (const s of sources) console.log(`${s.status.padEnd(11)} ${s.id}${s.missing ? ' missing: ' + s.missing.join(', ') : ''}${s.detail ? ' ' + s.detail : ''}`);
