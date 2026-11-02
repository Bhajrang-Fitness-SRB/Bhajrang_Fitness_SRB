import { useMemo } from 'react';

type Pkg = { id: string; name: string; price: number; duration_months: number; category?: string };

/** Groups are recognised from the start of the package name, so nothing changes in the database. */
export const PACKAGE_GROUPS: Array<{ key: string; label: string; test: RegExp }> = [
  { key: 'new', label: 'New joining', test: /^new member/i },
  { key: 'renewal', label: 'Renewal', test: /^renewal/i },
  { key: 'student', label: 'Student', test: /^student/i },
  { key: 'women', label: 'Women (4-6 PM)', test: /^women/i },
  { key: 'senior', label: 'Senior 55+', test: /^senior/i },
  { key: 'kids', label: 'Kids', test: /^kids/i },
  { key: 'couple', label: 'Couples', test: /^couples?\b/i },
  { key: 'duo', label: 'Duo (2 friends)', test: /^duo/i },
  { key: 'staff', label: 'Staff', test: /^staff/i },
  { key: 'other', label: 'Other', test: /./ },
];

export const groupOf = (name: string): string => PACKAGE_GROUPS.find((g) => g.test.test(name.trim()))?.key ?? 'other';
const money = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const plan = (p: Pkg) => `${p.name} — ${money(p.price)} (${p.duration_months} mo)`;

/** The package a new renewal should start on: the shortest Renewal plan. */
export function defaultRenewal<T extends Pkg>(packages: T[]): T | undefined {
  const r = packages.filter((p) => groupOf(p.name) === 'renewal' && p.category !== 'PT').sort((a, b) => a.duration_months - b.duration_months);
  return r[0] ?? packages.find((p) => p.category !== 'PT') ?? packages[0];
}

/**
 * Two easy steps instead of one long list:
 *   1. tap WHO it is for (New joining, Renewal, Student, Couples, ...)
 *   2. pick the length (1, 3, 6, 9, 12 months) - shown with its price.
 * Tapping another group keeps the same length when that group has it.
 */
export function PackagePicker({ packages, value, onChange, disabled, includePT = false }: {
  packages: Pkg[]; value: string; onChange: (name: string) => void; disabled?: boolean; includePT?: boolean;
}) {
  const list = useMemo(() => packages.filter((p) => includePT || p.category !== 'PT'), [packages, includePT]);
  const byGroup = useMemo(() => {
    const m = new Map<string, Pkg[]>();
    for (const p of list) { const k = groupOf(p.name); m.set(k, [...(m.get(k) ?? []), p]); }
    for (const arr of m.values()) arr.sort((a, b) => a.duration_months - b.duration_months || a.price - b.price);
    return m;
  }, [list]);
  const current = list.find((p) => p.name === value);
  const activeKey = current ? groupOf(current.name) : [...byGroup.keys()][0];
  const groups = PACKAGE_GROUPS.filter((g) => byGroup.has(g.key));
  const inGroup = byGroup.get(activeKey ?? '') ?? [];

  const chooseGroup = (key: string) => {
    const arr = byGroup.get(key); if (!arr?.length) return;
    onChange((arr.find((p) => current && p.duration_months === current.duration_months) ?? arr[0]).name);
  };
  const chip = (on: boolean): React.CSSProperties => ({ padding: '6px 11px', borderRadius: 999, fontSize: 12.5, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${on ? 'var(--gold, #f5c518)' : 'var(--line, #26364a)'}`, background: on ? 'rgba(245,197,24,.15)' : 'transparent', color: on ? '#fff' : '#9aa8bb', font: 'inherit', fontWeight: on ? 700 : 500 });

  if (!list.length) return <div className="muted" style={{ fontSize: 12 }}>No packages yet.</div>;
  return <div>
    <div role="group" aria-label="Who is this package for" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {groups.map((g) => <button key={g.key} type="button" disabled={disabled} aria-pressed={g.key === activeKey} style={chip(g.key === activeKey)} onClick={() => chooseGroup(g.key)}>{g.label}{' '}<span style={{ opacity: .6 }}>({byGroup.get(g.key)!.length})</span></button>)}
    </div>
    <select value={current ? current.name : ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="Package length and price">
      {!current && <option value="">Choose a package…</option>}
      {inGroup.map((p) => <option key={p.id} value={p.name}>{plan(p)}</option>)}
    </select>
  </div>;
}
