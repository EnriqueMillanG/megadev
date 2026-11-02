#!/usr/bin/env node
// render.mjs: render one kb page (.svx) to static HTML, the way the desk's kb shows it.
// No dependencies (the kb's Svelte toolchain is not in this export). It ports, line for line, the
// logic of the components this page uses: runbook layout, Callout, CauseTable, SplitCounts and
// RenderStamp. Data comes from support-kb/src/lib/data, as in the kb.
//
//   node tools/render.mjs support-kb/src/routes/kb/incidents/4471/causes/+page.svx rendered/kb/incidents/4471/causes/index.html

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: node tools/render.mjs <page.svx> <out.html>');
const KB = 'support-kb/src';
const DATA = join(KB, 'lib/data');

// ---- data (as imported in the kb) ----
const reports = JSON.parse(readFileSync(join(DATA, 'reports-4471.json'), 'utf8'));
const notes = JSON.parse(readFileSync(join(DATA, 'desk-notes.json'), 'utf8'));
const tenants = readdirSync(join(DATA, 'tenants')).map((f) => JSON.parse(readFileSync(join(DATA, 'tenants', f), 'utf8')));
const byHandle = new Map(tenants.map((t) => [t.handle, t]));
const tenantOf = (r) => byHandle.get(r.tenant);

// ---- src/lib/kb/causes.ts ----
const DATE_HINT = { 'booking-v2': 'DD/MM/YYYY', 'booking-v3': 'MM/DD/YYYY' };
function dayFirst(locale) {
  const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12)))
    .map((p) => p.type);
  return order.indexOf('day') < order.indexOf('month');
}
function causeOf(r, t) {
  if (!t || !dayFirst(t.locale)) return null;
  return r.channel === 'form' && DATE_HINT[t.form].startsWith('MM') ? 'hint' : 'parser';
}
const uniqueById = (rs) => [...new Map(rs.map((r) => [r.id, r])).values()];
function groupByCause(rs) {
  const by = new Map();
  for (const r of rs) {
    const c = causeOf(r, tenantOf(r)) ?? 'unplaced';
    by.set(c, [...(by.get(c) ?? []), r]);
  }
  return [...by.entries()]
    .map(([cause, rs]) => {
      const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        cause,
        reports: rs,
        taggedAs: rs.reduce((n, r) => ({ ...n, [r.meta.intakeTag]: (n[r.meta.intakeTag] ?? 0) + 1 }), {}),
        tenants: new Set(rs.map((r) => r.tenant)).size,
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
        mergedInto: [...new Set(rs.flatMap((r) => (r.mergedInto ? [r.mergedInto] : [])))],
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length);
}
const ticketCause = (gs, t) => gs.find((g) => g.mergedInto.includes(t))?.cause ?? null;
const readAs = (g, ids) => g.reports.filter((r) => ids.includes(r.id)).length;

// ---- src/lib/kb/desk-ref.ts ----
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function fnv1a(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function deskRef(signature) {
  const t = signature.trim();
  const a = fnv1a(t, 0x811c9dc5);
  const b = fnv1a(t, 0x9e3779b9);
  let bits = (BigInt(a) << 8n) | BigInt(b & 0xff);
  let o = '';
  for (let i = 0; i < 8; i++) {
    o = ALPHABET[Number(bits & 31n)] + o;
    bits >>= 5n;
  }
  return `DR-${o.slice(0, 4)}-${o.slice(4)}`;
}

// ---- src/lib/kb/staleness.ts ----
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const daysSince = (d, now = new Date()) => Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);

// ---- helpers ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

// ---- components ----
function CauseTable(ticket) {
  const merged = uniqueById(reports).filter((r) => r.mergedInto === ticket);
  const groups = groupByCause(merged);
  const owner = ticketCause(groups, ticket);
  const tags = (g) => Object.entries(g.taggedAs).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ×${n}`).join(' · ');
  let h = `<p class="sum"><strong>${merged.length}</strong> reports merged into #${ticket} · <strong>${groups.length}</strong> ${groups.length === 1 ? 'cause' : 'causes'}</p>`;
  h += '<table><thead><tr><th>cause</th><th>reports</th><th>tagged as</th><th>tenants</th><th>seen</th><th></th></tr></thead><tbody>';
  for (const g of groups) {
    h += `<tr class="${g.cause !== owner ? 'wrong' : ''}"><td><code>${g.cause}</code></td><td>${g.reports.length}</td><td class="tags">${esc(tags(g))}</td><td>${g.tenants}</td><td>${g.firstSeen} → ${g.lastSeen}</td><td>${g.cause === owner ? `#${ticket}` : 'not this ticket — no ticket of its own'}</td></tr>`;
  }
  h += '</tbody></table>';
  for (const g of groups) {
    const moved = readAs(g, notes.oneDayMove);
    if (moved) h += `<p class="note">${moved} reports read as a one-day move; filed under <code>${g.cause}</code> by tenant.</p>`;
  }
  return h;
}
function SplitCounts(ticket, issues) {
  const merged = uniqueById(reports).filter((r) => r.mergedInto === ticket);
  const count = new Map();
  for (const r of merged) {
    const k = notes.oneDayMove.includes(r.id) ? 'one-day move' : (causeOf(r, tenantOf(r)) ?? 'unplaced');
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const rows = [...count.entries()].sort((a, b) => b[1] - a[1]);
  let h = `<p class="sum"><strong>${merged.length}</strong> reports in #${ticket} · <strong>${rows.length}</strong> problems</p>`;
  h += '<table><thead><tr><th>problem</th><th>reports</th><th>ticket</th></tr></thead><tbody>';
  for (const [p, n] of rows) {
    const u = issues[p];
    h += `<tr><td><code>${esc(p)}</code></td><td>${n}</td><td>${u ? `<a href="${u}">${u.replace(/^.*\/issues\//, 'megadev#')}</a>` : '—'}</td></tr>`;
  }
  return h + '</tbody></table>';
}
const Callout = (kind, body) => `<aside class="${kind}">${inline(body)}</aside>`;
const RenderStamp = (sig) =>
  sig
    ? `<p class="stamp">desk ref <b>${deskRef(sig)}</b></p>`
    : '<p class="stamp missing">no desk ref: this page isn\'t signed (no <code>signature</code> in its frontmatter)</p>';

// ---- the page ----
const raw = readFileSync(src, 'utf8');
const [, fm, rest] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
const meta = Object.fromEntries(
  fm.split('\n').map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^'(.*)'$/, '$1')];
  }),
);
const script = rest.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const issues = Function(`${script.replace(/^\s*import .*$/gm, '')}; return typeof issues === 'undefined' ? {} : issues;`)();
let body = rest.replace(/<script>[\s\S]*?<\/script>/, '').trim();

const blocks = [];
body = body.replace(/<Callout(?: kind="(\w+)")?>\s*([\s\S]*?)\s*<\/Callout>/g, (_, k, b) => `\u0000${blocks.push(Callout(k ?? 'note', b.replace(/\s+/g, ' '))) - 1}\u0000`);
body = body.replace(/<CauseTable ticket=\{(\d+)\} \/>/g, (_, t) => `\u0000${blocks.push(CauseTable(Number(t))) - 1}\u0000`);
body = body.replace(/<SplitCounts ticket=\{(\d+)\} \{issues\} \/>/g, (_, t) => `\u0000${blocks.push(SplitCounts(Number(t), issues)) - 1}\u0000`);
body = body.replace(/<RenderStamp \{signature\} \/>/g, () => `\u0000${blocks.push(RenderStamp(meta.signature)) - 1}\u0000`);

const html = body
  .split(/\n\s*\n/)
  .map((chunk) => {
    const c = chunk.trim();
    const ph = c.match(/^\u0000(\d+)\u0000$/);
    if (ph) return blocks[Number(ph[1])];
    if (c.startsWith('## ')) return `<h2>${inline(c.slice(3))}</h2>`;
    if (c.startsWith('- ')) {
      const items = c.split(/\n(?=- )/).map((i) => `<li>${inline(i.slice(2).replace(/\s*\n\s*/g, ' '))}</li>`);
      return `<ul>${items.join('')}</ul>`;
    }
    return `<p>${inline(c.replace(/\s*\n\s*/g, ' '))}</p>`;
  })
  .join('\n');

// ---- src/lib/layouts/runbook.svelte ----
const age = daysSince(meta.reviewed);
const stale = age > 180;
const css = readFileSync(join(KB, 'lib/layouts/runbook.svelte'), 'utf8')
  .match(/<style>([\s\S]*)<\/style>/)[1]
  .replace(/:global\(([^)]*)\)/g, '$1');
const comp = `
  .sum { font-size: 1.1rem; } .tags, .note { color: var(--muted); font-size: 0.85em; }
  .wrong td { background: var(--warn-bg); } .wrong td:last-child { color: var(--warn); font-weight: 600; }
  aside { border-left: 4px solid var(--accent); padding: 0.5rem 1rem; margin: 1rem 0; background: var(--note-bg); }
  aside.warn { border-color: var(--warn); background: var(--warn-bg); }
  .stamp { margin: 2rem 0 0; font: 0.85rem var(--mono); color: var(--muted); } .stamp b { color: var(--accent); letter-spacing: 0.04em; }
  .missing { color: var(--warn); } table { display: block; overflow-x: auto; }`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} · support kb</title>
<style>${css}${comp}</style>
</head>
<body>
<div class="kb">
  <header>
    <a class="crumb" href="/kb">support desk · kb</a>
    <h1>${esc(meta.title)}</h1>
    <p class="meta">
      <span>owner <b>${esc(meta.owner)}</b></span>
      <span class="status ${esc(meta.status)}">${esc(meta.status)}</span>
      <span class="${stale ? 'stale' : ''}">reviewed ${isoDay(meta.reviewed)} · ${age} days ago${stale ? ' · stale' : ''}</span>
    </p>
  </header>
  ${stale ? `<p class="banner">Nobody has re-read this page in ${age} days. Check it against the live views before you rely on it.</p>` : ''}
  <main>
${html}
  </main>
  <footer>Pages are written by people. Tables and charts are built from data at render time.</footer>
</div>
</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`rendered ${src} -> ${out} · desk ref ${meta.signature ? deskRef(meta.signature) : 'none'}`);
