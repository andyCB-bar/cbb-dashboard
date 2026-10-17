// Self-test: catches truncated / null-padded files before a push.
// Run: node selftest.mjs   (exit 0 = green)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL  ' + m); };
const pass = (m) => console.log('ok    ' + m);

const checks = [
  ['worker.js', '// EOF worker.js'],
  ['dashboard.html', '<!-- EOF dashboard.html -->'],
  ['wrangler.toml', '# EOF wrangler.toml'],
  ['package.json', null]
];
for (const [f, marker] of checks) {
  let s;
  try { s = readFileSync(f, 'utf8'); } catch (e) { fail(f + ' missing'); continue; }
  if (s.includes('\u0000')) { fail(f + ' contains null bytes (sync hazard)'); continue; }
  if (marker && !s.trimEnd().endsWith(marker)) { fail(f + ' is incomplete (missing end marker)'); continue; }
  pass(f + ' complete (' + s.length + ' bytes)');
}

// package.json parses
try { JSON.parse(readFileSync('package.json', 'utf8')); pass('package.json parses'); } catch (e) { fail('package.json invalid JSON'); }

// wrangler name matches package name
const toml = readFileSync('wrangler.toml', 'utf8');
const name = (toml.match(/^name\s*=\s*"([^"]+)"/m) || [])[1];
if (!name || name === 'venue-dashboard') fail('wrangler.toml name not set to the repo name'); else pass('wrangler name = ' + name);
if (!/binding\s*=\s*"TOKENS"/.test(toml)) fail('TOKENS KV binding missing'); else pass('TOKENS binding present');

// worker.js syntax (strip the html import so node can parse it standalone)
const w = readFileSync('worker.js', 'utf8').replace(/^import dashboardHtml from '\.\/dashboard\.html';$/m, "const dashboardHtml = '';");
const r1 = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: w, encoding: 'utf8' });
if (r1.status !== 0) fail('worker.js syntax error:\n' + r1.stderr); else pass('worker.js parses');

// dashboard inline script syntax
const html = readFileSync('dashboard.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) fail('dashboard.html has no script');
else {
  const r2 = spawnSync(process.execPath, ['--check'], { input: m[1], encoding: 'utf8' });
  if (r2.status !== 0) fail('dashboard script syntax error:\n' + r2.stderr); else pass('dashboard script parses');
  if (!/KIT_CONFIG_END/.test(html) || !/fetchData\(\);\s*<\/script>/.test(html)) fail('dashboard boot section missing'); else pass('dashboard boot present');
}

console.log(ok ? '\nGREEN' : '\nRED');
process.exit(ok ? 0 : 1);
