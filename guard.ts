// Safety guards (pure functions). The real gate is the owner's approval; these are
// defence in depth so a confused or manipulated model cannot even *propose* the worst things.

export type Edit = { find: string; replace: string };
export type FileChange =
  | { path: string; action: 'patch'; edits: Edit[] }
  | { path: string; action: 'write'; content: string }
  | { path: string; action: 'delete' };

/** Paths agents may change in the repo. */
const ALLOWED_PREFIXES = ['src/', 'public/', 'site/', 'supabase/functions/', 'supabase/migrations/', 'index.html'];
/** Paths agents may never change: their own guard rails, secrets, build/deploy config. */
const BLOCKED = [
  /^supabase\/functions\/agent-hub\//, /^src\/agent-hub\//, /agent_hub/i,
  /^\.github\//, /^\.env/, /(^|\/)\.env/, /^package(-lock)?\.json$/, /^render\.yaml$/, /^vite\.config/, /^tsconfig/,
  /^public\/sw\.js$/, /^\.git/,
];

export function checkPath(path: string): string | null {
  if (typeof path !== 'string' || !path || path.length > 200) return 'Missing file path.';
  if (path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('\0')) return `Path not allowed: ${path}`;
  if (BLOCKED.some(re => re.test(path))) return `This file is protected and cannot be changed by an agent: ${path}`;
  if (!ALLOWED_PREFIXES.some(p => path === p || path.startsWith(p))) return `Agents may only change files under ${ALLOWED_PREFIXES.join(', ')}: ${path}`;
  return null;
}

/** Exact find/replace. Every `find` must occur exactly once so a patch can never hit the wrong place. */
export function applyEdits(content: string, edits: Edit[]): { ok: true; content: string } | { ok: false; error: string } {
  if (!Array.isArray(edits) || edits.length === 0) return { ok: false, error: 'No edits given.' };
  let out = content;
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i];
    if (typeof e?.find !== 'string' || typeof e?.replace !== 'string' || e.find.length === 0) return { ok: false, error: `Edit ${i + 1}: "find" must be a non-empty string.` };
    const first = out.indexOf(e.find);
    if (first === -1) return { ok: false, error: `Edit ${i + 1}: the "find" text was not found in the file. Read the file again and copy the text exactly.` };
    if (out.indexOf(e.find, first + 1) !== -1) return { ok: false, error: `Edit ${i + 1}: the "find" text appears more than once. Include more surrounding text so it is unique.` };
    out = out.slice(0, first) + e.replace + out.slice(first + e.find.length);
  }
  return { ok: true, content: out };
}

// ---- SQL
const SQL_FORBIDDEN: [RegExp, string][] = [
  [/\bagent_hub_/i, 'The Hub\'s own tables are protected.'],
  [/\bvault\s*\./i, 'The secrets vault cannot be touched.'],
  [/\b(auth|storage|extensions|pg_catalog|information_schema|supabase_functions|net|cron)\s*\./i, 'System schemas cannot be changed.'],
  [/\b(create|alter|drop)\s+(role|user|database|schema|extension|publication|subscription|event\s+trigger)\b/i, 'Roles, databases, schemas and extensions cannot be changed.'],
  [/\bset\s+(session\s+)?(role|session_replication_role|session\s+authorization)\b/i, 'Role switching is not allowed.'],
  [/\b(owner_passcode|verify_owner_passcode|set_owner_passcode|owner_login_guard|ghost_vault|verify_admin_access)\b/i, 'Owner-login and member-passcode objects are protected.'],
  [/\b(pg_read_file|pg_ls_dir|lo_import|lo_export|dblink|copy\s+.*\bprogram\b|pg_sleep)\b/i, 'File, network and program access from SQL is not allowed.'],
  [/\b(create|alter|drop)\s+(policy)\b/i, 'Security policies (RLS) cannot be changed by an agent.'],
  [/\b(disable|no\s+force)\s+row\s+level\s+security\b/i, 'Row-level security cannot be turned off.'],
  [/\bcron\.(schedule|unschedule)\b/i, 'Scheduled jobs cannot be changed by an agent.'],
];

/** Strip comments and string literals so keywords inside text are not misread. */
export function stripSql(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''").replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''");
}

export function checkSql(sql: string): { ok: boolean; error?: string; destructive: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (typeof sql !== 'string' || !sql.trim()) return { ok: false, error: 'No SQL given.', destructive: false, reasons };
  if (sql.length > 60_000) return { ok: false, error: 'SQL is too long (max 60,000 characters).', destructive: false, reasons };
  // Function bodies in $$ quotes are replaced by stripSql, so check the raw text for forbidden objects too.
  const flat = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  for (const [re, why] of SQL_FORBIDDEN) if (re.test(flat)) return { ok: false, error: why, destructive: false, reasons };
  const s = stripSql(sql);
  for (const stmt of s.split(';')) {
    if (/^\s*(grant|revoke)\b/i.test(stmt) && !/^\s*grant\s+execute\s+on\s+function\s+[\w."(), ]+\s+to\s+(anon|authenticated|service_role)(\s*,\s*(anon|authenticated|service_role))*\s*$/i.test(stmt))
      return { ok: false, error: 'Only "GRANT EXECUTE ON FUNCTION ... TO anon/authenticated/service_role" is allowed. Table permissions and REVOKE cannot be changed by an agent.', destructive: false, reasons };
  }
  if (/\bdrop\s+(table|column|view|function|index|type|trigger|constraint)\b/i.test(s)) reasons.push('Deletes a table, column or other object');
  if (/\btruncate\b/i.test(s)) reasons.push('Empties a table (TRUNCATE)');
  for (const stmt of s.split(';')) {
    if (/^\s*delete\s+from\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) reasons.push('DELETE with no WHERE (removes every row)');
    if (/^\s*update\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) reasons.push('UPDATE with no WHERE (changes every row)');
    if (/^\s*alter\s+table\b.*\b(drop|alter)\s+column\b/i.test(stmt)) reasons.push('Drops or retypes a column');
  }
  return { ok: true, destructive: reasons.length > 0, reasons: [...new Set(reasons)] };
}

// ---- misc
export const MESSAGE_AUDIENCES = ['everyone', 'all_active', 'expiring_7d', 'recently_expired_30d', 'lapsed_6m', 'birthdays_today', 'member_ids'] as const;
export const SETTING_KEY = /^[a-z][a-z0-9_]{1,40}$/;
export const SETTING_BLOCKED = /(passcode|secret|token|password|key$)/i;

/** Pull ```proposal / ```read / ```delegate blocks out of a model reply. */
export function extractBlocks(text: string): { clean: string; blocks: { type: string; raw: string }[] } {
  const blocks: { type: string; raw: string }[] = [];
  const clean = text.replace(/```(proposal|read|delegate)[ \t]*\r?\n([\s\S]*?)```/g, (_m, type: string, raw: string) => { blocks.push({ type, raw: raw.trim() }); return ''; });
  return { clean: clean.replace(/\n{3,}/g, '\n\n').trim(), blocks };
}
export function parseJsonLoose(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* try the outermost braces */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('not valid JSON');
}

/** Agents may READ more than they may change (but never secrets or git internals). */
export function checkReadPath(path: string): string | null {
  if (typeof path !== 'string' || !path || path.length > 200) return 'Missing file path.';
  if (path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('\0')) return `Path not allowed: ${path}`;
  if (/(^|\/)\.env/.test(path) || /^\.git/.test(path)) return `Cannot read: ${path}`;
  if (!ALLOWED_PREFIXES.some(p => path === p || path.startsWith(p)) && !/^(README\.md|package\.json|render\.yaml|vite\.config\.ts)$/.test(path)) return `Cannot read: ${path}`;
  return null;
}
