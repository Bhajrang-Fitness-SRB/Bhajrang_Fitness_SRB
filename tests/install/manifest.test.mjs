// Checks that every page gets the right installable-app identity BEFORE the app loads, and that every file it points to exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = html.match(/<script>\s*\/\/ Each page is its own[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
function run(pathname) {
  const head = []; const doc = { title: '', head: { appendChild: (el) => head.push(el) }, createElement: () => { const a = {}; return { setAttribute: (k, v) => { a[k] = v; }, a }; } };
  vm.runInNewContext(script, { location: { pathname }, document: doc });
  const by = (rel) => head.map((e) => e.a).find((a) => a.rel === rel);
  return { manifest: by('manifest').href, touch: by('apple-touch-icon').href, appTitle: head.map((e) => e.a).find((a) => a.name === 'apple-mobile-web-app-title').content, title: doc.title };
}
const expect = { '/': 'staff', '/villain': 'admin', '/warrior': 'warrior', '/kiosk': 'kiosk', '/villain/': 'admin', '/warrior//': 'warrior', '/join': 'staff', '/selling': 'staff', '/install': 'staff', '/random': 'staff' };
const names = { staff: 'Staff', admin: 'Admin', warrior: 'Warrior', kiosk: 'Kiosk' };
for (const [path, role] of Object.entries(expect)) test(`${path} installs as ${role}`, () => {
  const r = run(path);
  assert.equal(r.manifest, `/manifest-${role}.webmanifest`); assert.equal(r.touch, `/brand/apple-touch-${role}.png`);
  assert.equal(r.appTitle, names[role]); assert.equal(r.title, `Bhajrang ${names[role]}`);
});
test('static staff-only manifest link is gone and files exist', () => {
  assert.ok(!/<link rel="manifest"/.test(html), 'a static manifest link would win over the script');
  for (const role of Object.values(names).map((n) => (n === 'Admin' ? 'admin' : n.toLowerCase()))) {
    const m = JSON.parse(fs.readFileSync(new URL(`public/manifest-${role}.webmanifest`, root), 'utf8'));
    assert.ok(m.start_url.startsWith('/') && m.scope.startsWith('/'));
    for (const i of m.icons) assert.ok(fs.existsSync(new URL('public' + i.src, root)), i.src);
    assert.ok(fs.existsSync(new URL(`public/brand/apple-touch-${role}.png`, root)));
  }
});
test('each app opens its own page, not Staff', () => {
  const start = (r) => JSON.parse(fs.readFileSync(new URL(`public/manifest-${r}.webmanifest`, root), 'utf8')).start_url;
  assert.equal(start('admin'), '/villain'); assert.equal(start('warrior'), '/warrior'); assert.equal(start('kiosk'), '/kiosk'); assert.equal(start('staff'), '/');
});
