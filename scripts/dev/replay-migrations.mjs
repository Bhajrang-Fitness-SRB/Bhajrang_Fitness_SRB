// Replays every migration, in order, on an empty Postgres (with Supabase-style roles) to prove a blank install works.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
const dir = '/tmp/rbf_replay'; fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54555, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54555, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
await db.query(`alter database gym set search_path = public, extensions;`); await db.end(); const db2 = new pg.Client({ host: 'localhost', port: 54555, user: 'postgres', password: 'pw', database: 'gym' }); await db2.connect(); Object.assign(db, { query: db2.query.bind(db2), end: db2.end.bind(db2) });
await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;
 create schema if not exists auth; create schema if not exists vault; create table vault.decrypted_secrets (name text, decrypted_secret text); create schema if not exists storage;
 create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
 alter table storage.objects enable row level security;
 grant usage on schema public, extensions to anon, authenticated, service_role;
 alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
 alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
 alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
const mdir = new URL('../../supabase/migrations/', import.meta.url).pathname;
const files = fs.readdirSync(mdir).filter(f => f.endsWith('.sql')).sort();
let bad = 0;
for (const f of files) {
  try { await db.query(fs.readFileSync(path.join(mdir, f), 'utf8').replace(/create extension if not exists (pg_net|pg_cron)[^;]*;/gi, '-- (extension provided by Supabase)')); console.log('OK  ', f); }
  catch (e) { bad++; console.log('FAIL', f, '->', e.message.split('\n')[0]); }
}
const live = process.env.LIVE_TABLES ? process.env.LIVE_TABLES.split(',') : [];
const have = (await db.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(r=>r.tablename);
if (live.length) console.log('MISSING TABLES:', live.filter(t=>!have.includes(t)).join(', '));
const c = async (t) => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
for (const t of ['members','packages','staff','gym_settings','gym_rules','workout_exercises','notices']) { try { console.log('rows', t, await c(t)); } catch (e) { console.log('rows', t, 'n/a'); } }
console.log('functions:', (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows[0].n);
console.log('anon-open tables:', (await db.query(`select string_agg(distinct table_name, ', ') s from information_schema.role_table_grants where table_schema='public' and grantee='anon'`)).rows[0].s);
console.log('POLICIES:'); for (const r of (await db.query(`select tablename||'.'||policyname||' ['||cmd||'] '||roles::text s from pg_policies where schemaname='public' order by 1`)).rows) console.log('  '+r.s);
console.log('ANON GRANTS:'); for (const r of (await db.query(`select table_name, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and grantee='anon' group by 1 order by 1`)).rows) console.log('  '+r.table_name+': '+r.p);
await db.end(); await server.stop(); process.exit(bad ? 1 : 0);
