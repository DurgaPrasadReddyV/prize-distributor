// PROTOTYPE - throwaway. Renders every refusal as the Distributor sees it, so the
// two grades can be judged side by side rather than described in a test.
// Run: npm --prefix app i -D vitest && node prototype/see-messages.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '.');
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
const messages = await server.ssrLoadModule('/src/lib/messages.ts');
const ledger = await server.ssrLoadModule('/src/lib/ledger.ts');
await server.close();

const { resolveRefusal } = ledger;
const m = messages;

const CASES = [
  ['Already Won — the rule HELD (enforced by the repository)', m.alreadyWon('alex')],
  ['Already Won via 422 instead of 409', m.awardRefused(resolveRefusal(422, true), 'alex', 'Keyboard')],
  ['Prize exhausted — the app declining (advisory)', m.prizeExhausted('Keyboard', 0)],
  ['Self-issuance — the app declining (advisory)', m.selfIssuance('durga')],
  ['Write blocked: token lacks permission', m.awardRefused(resolveRefusal(403, false), 'alex', 'Keyboard')],
  ['Genuine failure: safe to retry', m.awardRefused(resolveRefusal(409, false), 'alex', 'Keyboard')],
  ['Unrecognised failure: still safe to retry', m.awardRefused(resolveRefusal(500, false), 'alex', 'Keyboard')],
  ['A 409 on a pending Entry means a PERSON, not a rule', m.entryEditLost()],
  ['Token is more powerful than needed', m.overScopedToken(['repo', 'gist'])],
];

const TONE = {
  good: ['e3f5ec', '0d5233', 'a8d9c2'],
  warn: ['fff4e5', '7a4700', 'f3d5a8'],
  bad: ['fdeaea', '7f1d1a', 'f3b8b4'],
  idle: ['f6f7f9', '6b7280', 'e3e5ea'],
};

const badge = (m) =>
  m.strength
    ? `<span style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.75">${m.strength}</span>`
    : '';

const html = `<!doctype html><meta charset="utf-8">
<title>Every refusal, as a Person reads it</title>
<style>
 body{font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;color:#16181d;
      background:#fbfbfc;margin:0;padding:40px 24px 80px}
 .wrap{max-width:760px;margin:0 auto}
 h1{font-size:22px;letter-spacing:-.01em;margin:0 0 4px}
 .sub{color:#6b7280;margin:0 0 28px}
 .case{margin-bottom:20px}
 .label{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#6b7280;margin:0 0 6px}
 .msg{padding:14px 16px;border-radius:5px;border:1px solid;margin:0}
 .msg strong{display:block;margin-bottom:3px;font-size:15px}
 .msg span{font-size:13.5px}
 .meta{font-size:11px;margin-top:7px;opacity:.7}
</style>
<div class="wrap">
<h1>Every refusal, as a Person reads it</h1>
<p class="sub">The top three are the interesting ones: the enforced refusal and the two advisory ones must not read alike, in words or in colour.</p>
${CASES.map(
  ([label, m]) => `<div class="case">
  <p class="label">${label}</p>
  <div class="msg" style="background:#${TONE[m.tone][0]};color:#${TONE[m.tone][1]};border-color:#${TONE[m.tone][2]}">
    <strong>${m.headline}</strong><span>${m.detail}</span>
    <div class="meta">tone: ${m.tone}${m.strength ? ' &nbsp;·&nbsp; ' + badge(m) : ''}</div>
  </div></div>`,
).join('\n')}
</div>`;

const out = new URL('../prototype/refusal-messages.html', import.meta.url);
writeFileSync(out, html);
console.log('wrote', out.pathname);
