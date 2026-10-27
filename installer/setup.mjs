#!/usr/bin/env node
// One-time setup. Needs only Node 18+ (no npm install). Run:  node setup.mjs
import fs from 'node:fs'; import path from 'node:path'; import readline from 'node:readline/promises';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const app = path.join(here, 'app'); const roots = [app, path.join(here, 'functions'), path.join(here, 'database')];
const rl = readline.createInterface({ input: process.stdin });
const queue = [], waiting = [];
rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : queue.push(l)));
rl.on('close', () => { while (waiting.length) waiting.shift()(''); });
const ask = (q) => { process.stdout.write(q); return queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiting.push(r)); };
console.log('\n=== Gym software setup ===\n');
const name = (await ask('Gym / branch name (shown in the app): ')).replace(/["'`\\<>${}]/g, '').trim() || 'My Gym';
const url = (await ask('Supabase Project URL (https://xxxx.supabase.co): ')).trim();
const key = (await ask('Supabase anon / publishable key: ')).trim();
const push = (await ask('OneSignal App ID for push notifications (optional, Enter to skip): ')).trim();
rl.close();
if (!/^https:\/\/.+\..+/.test(url) || key.length < 20) { console.error('\nThat URL or key does not look right. Nothing was changed. Run setup again.'); process.exit(1); }
fs.writeFileSync(path.join(app, 'config.js'), `window.RBF_CONFIG = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key, ONESIGNAL_APP_ID: push }, null, 2)};\n`);
let n = 0;
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|ts|sql|html|css|webmanifest)$/.test(f) || f === 'config.js') continue;
    const t = fs.readFileSync(p, 'utf8'); const u = t.replace(/MY GYM/g, name.toUpperCase()).replace(/My Gym/g, name);
    if (u !== t) { fs.writeFileSync(p, u); n++; }
  }
};
roots.forEach(walk);
console.log(`\nDone: branded ${n} files as "${name}" and saved your connection.\n\nNext:\n 1. Supabase → SQL Editor → paste database/install.sql → Run. Copy the "YOUR FIRST OWNER PASSCODE" it shows.\n 2. Upload the app/ folder to any static host (Render, Netlify, Cloudflare Pages, Vercel, or your own server).\n 3. Open the site, log in as Owner with that passcode, and fill in packages, staff and settings.\nOptional (messages & AI): see INSTALL.md → "Turn on WhatsApp, email, push, Telegram, AI".\n`);
