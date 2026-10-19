// Tiny in-memory stand-in for the parts of supabase-js the agent uses.
import { randomUUID } from 'node:crypto';
export const DB = { tables: {}, rpc: {}, seq: 0 };
const UNIQUE = { sa_messages: [['provider_mid']], sa_conversations: [['channel', 'external_id']], sa_followups: [['member_id', 'kind', 'expiry_date']] };
const DEFAULTS = {
  sa_conversations: () => ({ lang: 'en', stage: 'new', interests: [], summary: '', human_takeover: false, needs_attention: false, opted_out: false, display_name: null, member_id: null, last_inbound_at: null, last_outbound_at: null }),
  sa_bookings: () => ({ status: 'NEW' }),
};
const T = (n) => (DB.tables[n] ??= []);
class Q {
  constructor(table) { this.table = table; this.op = 'select'; this.f = []; this.ord = null; this.lim = null; this.count = false; this.head = false; this.ret = false; }
  select(_c, o) { if (this.op === 'select') {} else this.ret = true; if (o?.count) this.count = true; if (o?.head) this.head = true; return this; }
  insert(p) { this.op = 'insert'; this.p = p; return this; }
  update(p) { this.op = 'update'; this.p = p; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  in(c, a) { this.f.push((r) => a.includes(r[c])); return this; }
  gte(c, v) { this.f.push((r) => String(r[c]) >= String(v)); return this; }
  order(c, o) { this.ord = [c, o?.ascending !== false]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.single_ = 'maybe'; return this.run(); }
  single() { this.single_ = 'one'; return this.run(); }
  then(res, rej) { return this.run().then(res, rej); }
  async run() {
    const rows = T(this.table);
    if (this.op === 'insert') {
      const list = Array.isArray(this.p) ? this.p : [this.p]; const made = [];
      for (const p of list) {
        const row = { id: randomUUID(), created_at: new Date(Date.now() + (++DB.seq)).toISOString(), ...(DEFAULTS[this.table]?.() ?? {}), ...p, _seq: DB.seq };
        for (const cols of UNIQUE[this.table] ?? []) if (cols.every((c) => row[c] != null) && rows.some((r) => cols.every((c) => r[c] === row[c])))
          return { data: null, error: { message: `duplicate key (${cols})` } };
        rows.push(row); made.push(row);
      }
      return { data: this.single_ ? made[0] : this.ret ? made : null, error: null };
    }
    let hit = rows.filter((r) => this.f.every((fn) => fn(r)));
    if (this.op === 'update') { hit.forEach((r) => Object.assign(r, this.p)); return { data: null, error: null }; }
    if (this.ord) { const [c, asc] = this.ord; hit = [...hit].sort((a, b) => (String(a[c]) + String(a._seq)).localeCompare(String(b[c]) + String(b._seq)) * (asc ? 1 : -1)); }
    if (this.lim != null) hit = hit.slice(0, this.lim);
    if (this.head) return { data: null, count: hit.length, error: null };
    if (this.single_) return { data: hit[0] ?? null, error: null };
    return { data: hit, count: hit.length, error: null };
  }
}
export const createClient = () => ({
  from: (t) => new Q(t),
  rpc: async (name, args) => (DB.rpc[name] ? { data: await DB.rpc[name](args), error: null } : { data: null, error: { message: 'no rpc ' + name } }),
});
