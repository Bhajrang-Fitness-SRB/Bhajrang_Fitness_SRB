import { useCallback, useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Banknote, Bot, Check, Coins, Landmark, Play, QrCode, Trash2, TrendingUp, Upload, Wallet, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDay, todayIST } from './RenewalDesk';

const inr = (n: number | null | undefined) => `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`;
export const EXPENSE_CATEGORIES = ['Rent', 'Salary / trainers', 'Electricity', 'Water / internet', 'Equipment purchase', 'Repairs & maintenance', 'Marketing', 'Cleaning & supplies', 'Supplements purchase', 'Licence / tax', 'Other'];
const INCOME_CATEGORIES = ['Supplement sale', 'Personal training', 'Locker / merchandise', 'Event / camp', 'Other income'];

type Overview = {
  period: { from: string; to: string; days: number };
  income: { total: number; from_invoices: number; manual_entries: number; unlinked_qr_receipts: number; by_method: Record<string, number> };
  expenses: { total: number; by_category: Record<string, number>; by_payment_mode: Record<string, number> };
  net_profit: number; margin_pct: number | null;
  dues: { outstanding_total: number; invoices_with_due: number; collection_rate_pct: number | null };
  cash: { balance_now: number; recent_counts: { count_date: string; expected: number; counted: number; variance: number }[] };
  qr_reconciliation: { bharatpe_receipts_imported: number; invoices_paid_by_upi: number; manual_upi_entries: number; qr_money_without_invoice: number; imported: boolean };
  monthly_trend: { month: string; income: number; expenses: number }[];
  members: { active: number; expiring_next_7d: number; expiring_next_30d: number; lapsed_last_30d: number; expected_renewal_income_next_30d: number };
};
type Insight = { kind: string; title: string; detail: string; impact_inr_month: number | null };
type Report = { created_at: string; engine: string | null; status: string; summary: string | null; score: number | null; insights: Insight[]; forecast: { income_low: number | null; income_likely: number | null; income_high: number | null; expenses_likely: number | null; assumptions: string } | null; quality: { title: string; detail: string }[]; error: string | null; trigger: string };
type Entry = { id: number; entry_date: string; direction: 'IN' | 'OUT'; channel: string; category: string | null; amount: number; note: string | null; source: string };

const KIND: Record<string, { label: string; color: string }> = {
  earn: { label: 'EARN', color: 'var(--green)' }, save: { label: 'SAVE', color: 'var(--cyan)' }, cash: { label: 'CASH', color: 'var(--gold)' },
  risk: { label: 'RISK', color: 'var(--red, #ff5d5d)' }, quick_win: { label: 'QUICK WIN', color: 'var(--gold)' },
};

function periodRange(key: string): { from: string; to: string } {
  const to = todayIST(); const [y, m] = to.split('-').map(Number);
  const back = (n: number) => { const d = new Date(Date.UTC(y, m - 1, Number(to.slice(8)))); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  if (key === '30') return { from: back(29), to };
  if (key === '90') return { from: back(89), to };
  if (key === 'year') return { from: `${y}-01-01`, to };
  return { from: `${y}-${String(m).padStart(2, '0')}-01`, to };
}

// ---------- BharatPe statement parsing ----------
function toYmd(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ,]*(\d{4})/.exec(s);
  if (m) { const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase()); if (mon >= 0) return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
export function parseBharatPe(text: string): { rows: { date: string; amount: number; ref: string; note: string }[]; skipped: number } {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
  const cols = res.meta.fields ?? [];
  const find = (re: RegExp) => cols.find(c => re.test(c));
  const cDate = find(/(txn|transaction|payment|settlement)?.*date|time/i), cAmt = find(/amount|credit|received/i);
  const cRef = find(/utr|(txn|transaction|payment|ref).*(id|no|number)|^id$|reference/i), cStatus = find(/status/i), cName = find(/payer|name|vpa|customer|remark|note/i);
  const rows: { date: string; amount: number; ref: string; note: string }[] = []; let skipped = 0; const seen: Record<string, number> = {};
  if (!cDate || !cAmt) return { rows, skipped: res.data.length };
  for (const r of res.data) {
    const amount = Math.round(Number(String(r[cAmt] ?? '').replace(/[₹,\s]/g, '')));
    const date = toYmd(String(r[cDate] ?? ''));
    const status = cStatus ? String(r[cStatus] ?? '') : '';
    const text = Object.values(r).join(' ');
    if (!date || !isFinite(amount) || amount <= 0 || (cStatus && !/(success|settled|complete|paid|credited)/i.test(status)) || /(refund|reversal|failed|chargeback)/i.test(text)) { skipped++; continue; }
    const note = cName ? String(r[cName] ?? '').slice(0, 60) : '';
    let ref = cRef ? String(r[cRef] ?? '').trim() : '';
    if (!ref) { const k = `${date}|${amount}|${note}`; seen[k] = (seen[k] ?? 0) + 1; ref = `${k}|${seen[k]}`; }
    rows.push({ date, amount, ref, note });
  }
  return { rows, skipped };
}

// ---------- modals ----------
function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 520 }}><div className="modal-head"><div><p className="eyebrow">{eyebrow}</p><h2 style={{ margin: 0 }}>{title}</h2></div><button type="button" className="close" onClick={onClose}><X /></button></div>{children}</div></div>;
}

export function AddExpenseForm({ passcode, onSaved, onClose, notify }: { passcode: string; onSaved: () => void; onClose: () => void; notify: (m: string) => void }) {
  const [name, setName] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayIST());
  const [cat, setCat] = useState(EXPENSE_CATEGORIES[0]); const [mode, setMode] = useState('Cash'); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.rpc('admin_add_expense', { p_passcode: passcode, p_name: name, p_amount: Number(amount), p_date: date, p_category: cat, p_payment_mode: mode, p_note: note || null });
    setSaving(false); if (error) { notify(error.message || 'Could not save.'); return; }
    notify('Expense saved.'); onSaved();
  };
  return <Modal title="Log expense" eyebrow="Money out" onClose={onClose}><form onSubmit={save}>
    <div className="form-grid">
      <div className="field full"><label>What was it for?</label><input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. October electricity bill" /></div>
      <div className="field"><label>Amount (₹)</label><input required type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field"><label>Category</label><select value={cat} onChange={e => setCat(e.target.value)}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="field"><label>Paid by</label><select value={mode} onChange={e => setMode(e.target.value)}><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option></select></div>
      <div className="field full"><label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} /></div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</button></div>
  </form></Modal>;
}
export function ExpenseModal({ passcode, onClose, onSaved, notify }: { passcode: string; onClose: () => void; onSaved: () => void; notify: (m: string) => void }) {
  return <AddExpenseForm passcode={passcode} onClose={onClose} onSaved={onSaved} notify={notify} />;
}

function IncomeModal({ passcode, kind, onClose, onSaved, notify }: { passcode: string; kind: 'income' | 'deposit'; onClose: () => void; onSaved: () => void; notify: (m: string) => void }) {
  const [channel, setChannel] = useState(kind === 'deposit' ? 'Cash' : 'Cash'); const [cat, setCat] = useState(INCOME_CATEGORIES[0]); const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayIST()); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.rpc('admin_add_money_entry', { p_passcode: passcode, p_date: date, p_direction: kind === 'deposit' ? 'OUT' : 'IN', p_channel: channel, p_category: kind === 'deposit' ? 'Deposit to bank' : cat, p_amount: Number(amount), p_note: note || null, p_member_id: null });
    setSaving(false); if (error) { notify(error.message || 'Could not save.'); return; }
    notify(kind === 'deposit' ? 'Cash deposit recorded.' : 'Income recorded.'); onSaved();
  };
  return <Modal title={kind === 'deposit' ? 'Cash deposited to bank' : 'Add other income'} eyebrow={kind === 'deposit' ? 'Cash book' : 'Money in'} onClose={onClose}><form onSubmit={save}>
    <p className="sub" style={{ marginTop: 0 }}>{kind === 'deposit' ? 'Cash you took out of the drawer and put in the bank. This is a transfer, not an expense.' : 'For money that is not a membership invoice — supplements, personal training, merchandise. Membership payments are already counted from invoices.'}</p>
    <div className="form-grid">
      {kind === 'income' && <><div className="field"><label>Received by</label><select value={channel} onChange={e => setChannel(e.target.value)}><option>Cash</option><option>BharatPe QR</option><option>UPI</option><option>Card</option><option>Bank</option></select></div>
        <div className="field"><label>What for</label><select value={cat} onChange={e => setCat(e.target.value)}>{INCOME_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div></>}
      <div className="field"><label>Amount (₹)</label><input required type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field full"><label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} /></div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
  </form></Modal>;
}

export function CashCountModal({ passcode, onClose, onSaved, notify }: { passcode: string; onClose: () => void; onSaved: () => void; notify: (m: string) => void }) {
  const [counted, setCounted] = useState(''); const [date, setDate] = useState(todayIST()); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { data, error } = await supabase.rpc('admin_save_cash_count', { p_passcode: passcode, p_date: date, p_counted: Number(counted), p_note: note || null });
    setSaving(false); if (error) { notify(error.message || 'Could not save.'); return; }
    const r = data as { expected: number; variance: number };
    notify(r.variance === 0 ? 'Cash matches the books. ✔' : `Cash is ${r.variance > 0 ? 'more' : 'less'} than the books by ${inr(Math.abs(r.variance))} (books say ${inr(r.expected)}).`); onSaved();
  };
  return <Modal title="Count the cash drawer" eyebrow="Daily cash check" onClose={onClose}><form onSubmit={save}>
    <p className="sub" style={{ marginTop: 0 }}>Count the physical cash and enter it. The system compares it with what the invoices, cash entries and expenses say should be there.</p>
    <div className="form-grid"><div className="field"><label>Cash counted (₹)</label><input required type="number" min="0" value={counted} onChange={e => setCounted(e.target.value)} /></div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field full"><label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} /></div></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save count'}</button></div>
  </form></Modal>;
}

function ImportModal({ passcode, onClose, onSaved, notify }: { passcode: string; onClose: () => void; onSaved: () => void; notify: (m: string) => void }) {
  const [rows, setRows] = useState<{ date: string; amount: number; ref: string; note: string }[]>([]); const [skipped, setSkipped] = useState(0); const [file, setFile] = useState(''); const [saving, setSaving] = useState(false);
  const pick = async (f: File | undefined) => { if (!f) return; setFile(f.name); const r = parseBharatPe(await f.text()); setRows(r.rows); setSkipped(r.skipped); };
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const go = async () => {
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_import_money_entries', { p_passcode: passcode, p_rows: rows });
    setSaving(false); if (error) { notify(error.message || 'Import failed.'); return; }
    const r = data as { inserted: number; skipped: number };
    notify(`Imported ${r.inserted} payments${r.skipped ? ` (${r.skipped} already there)` : ''}.`); onSaved();
  };
  return <Modal title="Import BharatPe statement" eyebrow="QR payments" onClose={onClose}>
    <p className="sub" style={{ marginTop: 0 }}>In the BharatPe app / dashboard, download your transaction or settlement report as <b>CSV</b>, then choose it here. Payments already imported are skipped, so you can upload overlapping files safely.</p>
    <input type="file" accept=".csv,text/csv" onChange={e => void pick(e.target.files?.[0])} />
    {file && <div className="card" style={{ marginTop: 12, padding: 12 }}>{rows.length ? <><b>{rows.length} successful payments</b> · {inr(total)}<div className="muted" style={{ fontSize: 12 }}>{fmtDay(rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date))} → {fmtDay(rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date))}{skipped ? ` · ${skipped} rows ignored (failed / refunds / unreadable)` : ''}</div></> : <span style={{ color: 'var(--gold)' }}>No payments found. The file needs a date and an amount column — it may be an Excel file; save it as CSV first.</span>}</div>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={!rows.length || saving} onClick={() => void go()}>{saving ? 'Importing…' : `Import ${rows.length || ''} payments`}</button></div>
  </Modal>;
}

// ---------- main desk ----------
export function MoneyDesk({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [period, setPeriod] = useState('month');
  const [ov, setOv] = useState<Overview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [modal, setModal] = useState<'' | 'expense' | 'income' | 'deposit' | 'count' | 'import'>('');
  const [busy, setBusy] = useState(false);
  const range = useMemo(() => periodRange(period), [period]);

  const load = useCallback(async () => {
    const [o, r, e] = await Promise.all([
      supabase.rpc('admin_money_overview', { p_passcode: passcode, p_from: range.from, p_to: range.to }),
      supabase.rpc('admin_money_reports', { p_passcode: passcode }),
      supabase.rpc('admin_list_money_entries', { p_passcode: passcode, p_from: range.from, p_to: range.to }),
    ]);
    if (o.data) setOv(o.data as Overview);
    setReport(((r.data as { latest: Report | null } | null)?.latest) ?? null);
    setEntries((e.data as Entry[]) ?? []);
  }, [passcode, range]);
  useEffect(() => { void load(); }, [load]);

  const runAgent = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('money-agent', { body: { passcode, days: 30 } });
    setBusy(false);
    if (error || (data as { status?: string })?.status !== 'ok') { notify('The money agent could not finish. Check the AI keys in the AI Night Agent tab.'); void load(); return; }
    notify('Fresh money report ready.'); void load();
  };
  const del = async (id: number) => { if (!confirm('Delete this entry?')) return; const { error } = await supabase.rpc('admin_delete_money_entry', { p_passcode: passcode, p_id: id }); if (error) { notify('Could not delete.'); return; } void load(); };
  const done = () => { setModal(''); void load(); };

  if (!ov) return <div className="empty">Loading…</div>;
  const maxMonth = Math.max(1, ...ov.monthly_trend.flatMap(m => [m.income, m.expenses]));
  const cats = Object.entries(ov.expenses.by_category).sort((a, b) => b[1] - a[1]);
  const methods = Object.entries(ov.income.by_method).sort((a, b) => b[1] - a[1]);
  const lastCount = ov.cash.recent_counts[0];
  const scoreColor = (report?.score ?? 0) >= 75 ? 'var(--green)' : (report?.score ?? 0) >= 50 ? 'var(--gold)' : 'var(--red, #ff5d5d)';

  return <>
    <div className="page-head"><div><p className="eyebrow">Reviews every night at 10:00 PM</p><h1 className="title">Money Agent</h1>
      <p className="sub">Every rupee in and out — QR, cash, cards and expenses — with an AI that tells you where to earn more and save more.</p></div>
      <button className="button cyan" disabled={busy} onClick={() => void runAgent()}><Play size={15} /> {busy ? 'Analysing…' : 'Run review now'}</button></div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {[['month', 'This month'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year']].map(([k, l]) => <button key={k} className={`button ${period === k ? 'primary' : 'ghost'}`} style={{ padding: '6px 12px' }} onClick={() => setPeriod(k)}>{l}</button>)}</div>

    <div className="grid stats">
      <div className="card"><div className="muted" style={{ fontSize: 12 }}>Money in</div><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>{inr(ov.income.total)}</div><div className="muted" style={{ fontSize: 11 }}>{methods.map(([m, v]) => `${m} ${inr(v)}`).join(' · ') || 'nothing yet'}</div></div>
      <div className="card"><div className="muted" style={{ fontSize: 12 }}>Money out</div><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red, #ff5d5d)' }}>{inr(ov.expenses.total)}</div><div className="muted" style={{ fontSize: 11 }}>{cats.slice(0, 2).map(([c, v]) => `${c} ${inr(v)}`).join(' · ') || 'no expenses logged'}</div></div>
      <div className="card"><div className="muted" style={{ fontSize: 12 }}>Profit</div><div style={{ fontSize: 24, fontWeight: 700 }}>{inr(ov.net_profit)}</div><div className="muted" style={{ fontSize: 11 }}>{ov.margin_pct === null ? '—' : `${ov.margin_pct}% margin`}{ov.expenses.total === 0 ? ' · log expenses for a true figure' : ''}</div></div>
      <div className="card"><div className="muted" style={{ fontSize: 12 }}>Cash in drawer (books)</div><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{inr(ov.cash.balance_now)}</div><div className="muted" style={{ fontSize: 11 }}>{lastCount ? `Last count ${fmtDay(lastCount.count_date)}: ${lastCount.variance === 0 ? 'matched' : (lastCount.variance > 0 ? '+' : '−') + inr(Math.abs(lastCount.variance))}` : 'no cash count yet'}</div></div>
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
      <button className="button primary" onClick={() => setModal('expense')}><Wallet size={14} /> Log expense</button>
      <button className="button ghost" onClick={() => setModal('income')}><Coins size={14} /> Add other income</button>
      <button className="button ghost" onClick={() => setModal('deposit')}><Landmark size={14} /> Cash to bank</button>
      <button className="button ghost" onClick={() => setModal('count')}><Banknote size={14} /> Count cash</button>
      <button className="button ghost" onClick={() => setModal('import')}><Upload size={14} /> Import BharatPe</button></div>

    <div className="card" style={{ marginBottom: 20, borderColor: report ? 'var(--cyan)' : 'var(--line)' }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}><Bot size={15} /> AI money review</span>
        {report && <span>{new Date(report.created_at).toLocaleString()}{report.engine ? ` · ${report.engine}` : ''}</span>}</div>
      {!report && <p className="muted">No review yet. Press <b>Run review now</b>.</p>}
      {report && report.status !== 'ok' && <p style={{ color: 'var(--gold)' }}>{report.summary}{report.error ? ` (${report.error})` : ''}</p>}
      {report && report.status === 'ok' && <>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ width: 62, height: 62, borderRadius: '50%', border: `4px solid ${scoreColor}`, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, color: scoreColor, flexShrink: 0 }}>{report.score ?? '–'}</div>
          <p style={{ margin: 0 }}>{report.summary}</p></div>
        {report.insights.map((i, k) => <div key={k} style={{ borderLeft: `3px solid ${(KIND[i.kind] ?? KIND.quick_win).color}`, paddingLeft: 10, margin: '12px 0' }}>
          <div><span style={{ fontSize: 10, fontWeight: 700, color: (KIND[i.kind] ?? KIND.quick_win).color, marginRight: 8 }}>{(KIND[i.kind] ?? KIND.quick_win).label}</span><b>{i.title}</b>{i.impact_inr_month ? <span className="muted" style={{ fontSize: 12 }}> · ≈ {inr(i.impact_inr_month)}/month</span> : null}</div>
          <div className="muted" style={{ fontSize: 13 }}>{i.detail}</div></div>)}
        {report.forecast && report.forecast.income_likely !== null && <div className="card" style={{ marginTop: 12, padding: 12 }}><b style={{ fontSize: 13 }}><TrendingUp size={13} /> Next 30 days (estimate)</b>
          <div style={{ fontSize: 13, marginTop: 4 }}>Income {inr(report.forecast.income_low)} – {inr(report.forecast.income_high)}, most likely <b>{inr(report.forecast.income_likely)}</b>{report.forecast.expenses_likely !== null ? ` · expenses about ${inr(report.forecast.expenses_likely)}` : ''}</div>
          <div className="muted" style={{ fontSize: 11 }}>{report.forecast.assumptions}</div></div>}
        {report.quality.length > 0 && <div style={{ marginTop: 12 }}><b style={{ fontSize: 12 }}>To make the next review more accurate</b>{report.quality.map((q, k) => <div key={k} className="muted" style={{ fontSize: 12, marginTop: 4 }}>• <b style={{ color: '#fff' }}>{q.title}</b> — {q.detail}</div>)}</div>}
      </>}
    </div>

    <div className="grid layout-2" style={{ marginBottom: 20 }}>
      <div className="card"><div className="card-title">Last 6 months</div>
        {ov.monthly_trend.map(m => <div key={m.month} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{m.month}</span><span className="muted">{inr(m.income)} in · {inr(m.expenses)} out</span></div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, marginTop: 3 }}><div style={{ height: 6, width: `${(m.income / maxMonth) * 100}%`, background: 'var(--green)', borderRadius: 3 }} /></div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, marginTop: 2 }}><div style={{ height: 6, width: `${(m.expenses / maxMonth) * 100}%`, background: 'var(--red, #ff5d5d)', borderRadius: 3 }} /></div></div>)}</div>
      <div className="card"><div className="card-title">Where money goes</div>
        {cats.length ? cats.map(([c, v]) => <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}><span>{c}</span><b>{inr(v)}</b></div>) : <p className="muted">No expenses in this period.</p>}
        <div className="card-title" style={{ marginTop: 14 }}><QrCode size={14} /> BharatPe check</div>
        {ov.qr_reconciliation.imported ? <div style={{ fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>QR received (statement)</span><b>{inr(ov.qr_reconciliation.bharatpe_receipts_imported)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>UPI invoices + entries</span><b>{inr(ov.qr_reconciliation.invoices_paid_by_upi + ov.qr_reconciliation.manual_upi_entries)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: ov.qr_reconciliation.qr_money_without_invoice > 0 ? 'var(--gold)' : 'var(--green)' }}><span>QR money with no invoice</span><b>{inr(ov.qr_reconciliation.qr_money_without_invoice)}</b></div></div>
          : <p className="muted" style={{ fontSize: 12 }}>Import a BharatPe statement to catch QR payments that never got an invoice.</p>}
      </div>
    </div>

    <div className="card"><div className="card-title">Entries in this period <span>{entries.length}</span></div>
      {!entries.length && <p className="muted">No manual or imported entries. Membership invoices are counted automatically.</p>}
      {entries.slice(0, 40).map(e => <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 13 }}>
        <span className="muted" style={{ width: 78 }}>{fmtDay(e.entry_date)}</span><span style={{ flex: 1 }}>{e.category || '—'} <span className="muted">· {e.channel}{e.source === 'bharatpe_import' ? ' (imported)' : ''}{e.note ? ` · ${e.note}` : ''}</span></span>
        <b style={{ color: e.direction === 'IN' ? 'var(--green)' : 'var(--red, #ff5d5d)' }}>{e.direction === 'IN' ? '+' : '−'}{inr(e.amount)}</b>
        <button className="button ghost" style={{ padding: '4px 8px' }} onClick={() => void del(e.id)} aria-label="Delete"><Trash2 size={13} /></button></div>)}</div>

    {modal === 'expense' && <AddExpenseForm passcode={passcode} onClose={() => setModal('')} onSaved={done} notify={notify} />}
    {(modal === 'income' || modal === 'deposit') && <IncomeModal passcode={passcode} kind={modal} onClose={() => setModal('')} onSaved={done} notify={notify} />}
    {modal === 'count' && <CashCountModal passcode={passcode} onClose={() => setModal('')} onSaved={done} notify={notify} />}
    {modal === 'import' && <ImportModal passcode={passcode} onClose={() => setModal('')} onSaved={done} notify={notify} />}
    <p className="muted" style={{ fontSize: 11, marginTop: 14 }}><Check size={11} /> The AI only ever sees totals — never member names, phone numbers or photos.</p>
  </>;
}
