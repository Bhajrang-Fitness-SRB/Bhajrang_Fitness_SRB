import { useState } from 'react';
import { Copy, MessageCircle, X } from 'lucide-react';
import { supabase, type Member, type PendingApproval } from '../lib/supabase';

export const normMobile = (raw?: string | null) => {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
};
const validMobile = (m: string) => /^[6-9]\d{9}$/.test(m);

export type Issue = { text: string; blocker: boolean };

/** Form-fill check for one application (shown to staff before approving). */
export function checkApplication(a: PendingApproval, members: Member[], pending: PendingApproval[]): Issue[] {
  const out: Issue[] = [];
  const mob = normMobile(a.mobile);
  if (!a.name || a.name.trim().length < 2) out.push({ text: 'Name missing', blocker: true });
  if (!validMobile(mob)) out.push({ text: `Mobile “${a.mobile || ''}” is not a valid 10-digit number`, blocker: true });
  else {
    const m = members.find(x => normMobile(x.phone) === mob);
    if (m) out.push({ text: `Mobile already belongs to member ${m.member_id}`, blocker: true });
    if (pending.some(x => x.id !== a.id && normMobile(x.mobile) === mob)) out.push({ text: 'Same mobile in another pending application', blocker: false });
  }
  if (a.whatsapp && !validMobile(normMobile(a.whatsapp))) out.push({ text: 'WhatsApp number looks wrong', blocker: false });
  if (a.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) out.push({ text: 'Email looks wrong', blocker: false });
  if (!a.email) out.push({ text: 'No email (welcome email cannot be sent)', blocker: false });
  if (!a.dob) out.push({ text: 'Date of birth missing', blocker: false });
  else { const age = (Date.now() - new Date(a.dob).getTime()) / 31557600000; if (age < 10 || age > 90) out.push({ text: `Date of birth gives age ${Math.floor(age)}`, blocker: false }); }
  if (a.height_cm && (a.height_cm < 100 || a.height_cm > 250)) out.push({ text: `Height ${a.height_cm} cm looks wrong`, blocker: false });
  if (a.weight_kg && (a.weight_kg < 25 || a.weight_kg > 250)) out.push({ text: `Weight ${a.weight_kg} kg looks wrong`, blocker: false });
  if (!a.govt_id) out.push({ text: 'Govt. ID not given', blocker: false });
  if (!a.photo_base64) out.push({ text: 'No selfie', blocker: false });
  if (a.health_consent === false) out.push({ text: 'Health consent not ticked', blocker: false });
  return out;
}

export function IssueChips({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>✓ Form looks complete</div>;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{issues.slice(0, 4).map((i, k) =>
    <span key={k} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, border: `1px solid ${i.blocker ? 'var(--red, #ff5d5d)' : 'var(--gold)'}`, color: i.blocker ? 'var(--red, #ff5d5d)' : 'var(--gold)' }}>{i.text}</span>)}
    {issues.length > 4 && <span className="muted" style={{ fontSize: 10 }}>+{issues.length - 4} more</span>}</div>;
}

const FIELDS: [keyof PendingApproval, string, 'text' | 'date' | 'number' | 'area'][] = [
  ['name', 'Full name', 'text'], ['father_name', "Father's / guardian's name", 'text'], ['dob', 'Date of birth', 'date'], ['gender', 'Gender', 'text'],
  ['mobile', 'Mobile', 'text'], ['whatsapp', 'WhatsApp', 'text'], ['email', 'Email', 'text'], ['govt_id', 'Govt. ID number', 'text'],
  ['occupation', 'Occupation', 'text'], ['marital_status', 'Marital status', 'text'], ['blood_group', 'Blood group', 'text'], ['gym_experience_years', 'Gym experience (years)', 'text'],
  ['height_cm', 'Height (cm)', 'number'], ['weight_kg', 'Weight (kg)', 'number'], ['address', 'Address', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['pin', 'PIN', 'text'],
  ['goal', 'Goal', 'text'], ['medical_conditions', 'Medical conditions', 'area'],
];

/** Staff correct the applicant's details, or ask the applicant to correct them on WhatsApp, or reject. */
export function ApplicationEditModal({ app, issues, passcode, onClose, onChanged, notify }: { app: PendingApproval; issues: Issue[]; passcode: string; onClose: () => void; onChanged: () => void; notify: (m: string) => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, app[k] == null ? '' : String(app[k])])));
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    const changes: Record<string, string> = {};
    FIELDS.forEach(([k]) => { const before = app[k] == null ? '' : String(app[k]); if (form[k] !== before) changes[k] = form[k]; });
    if (!Object.keys(changes).length) { notify('Nothing changed.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_pending_approval', { p_passcode: passcode, p_id: app.id, p_changes: changes });
    setSaving(false);
    if (error) { notify(error.message.replace(/^.*?:\s*/, '') || 'Could not save the corrections.'); return; }
    notify('Corrections saved.'); onChanged(); onClose();
  };
  const reject = async () => {
    const reason = prompt(`Reject ${app.name || 'this application'}? Add a short reason (optional):`);
    if (reason === null) return;
    const { error } = await supabase.rpc('admin_reject_pending_approval', { p_passcode: passcode, p_id: app.id, p_reason: reason });
    if (error) { notify('Could not reject.'); return; }
    notify('Application rejected.'); onChanged(); onClose();
  };
  const wa = normMobile(app.whatsapp || app.mobile);
  const msg = `Hi ${app.name || ''}, thank you for applying to Bhajrang Fitness. Please correct these details in your application and reply here:\n- ${issues.filter(i => i.blocker || /wrong|missing|No /.test(i.text)).map(i => i.text).join('\n- ') || 'Please confirm your details'}`;

  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 680 }}>
    <div className="modal-head"><div><p className="eyebrow">Application #{String(app.id).padStart(4, '0')}</p><h2 style={{ margin: 0 }}>Check &amp; correct details</h2></div><button type="button" className="close" onClick={onClose}><X /></button></div>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
      {app.photo_base64 ? <img src={app.photo_base64} alt="Selfie" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--gold)' }} /> : <div className="muted">No selfie</div>}
      <div style={{ flex: 1 }}><IssueChips issues={issues} /></div>
    </div>
    <div className="form-grid">{FIELDS.map(([k, label, kind]) => <div key={k} className="field" style={kind === 'area' || k === 'address' ? { gridColumn: '1 / -1' } : undefined}><label>{label}</label>
      {kind === 'area' ? <textarea rows={2} value={form[k]} onChange={e => set(k)(e.target.value)} /> : <input type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'} value={form[k]} onChange={e => set(k)(e.target.value)} />}</div>)}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
      <button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save corrections'}</button>
      {wa.length === 10 && <a className="button ghost" href={`https://wa.me/91${wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Ask applicant to correct</a>}
      <button className="button danger" style={{ marginLeft: 'auto' }} onClick={() => void reject()}>Reject</button>
    </div>
  </div></div>;
}

/** Shown right after approval: the member's login, ready to send. */
export function ApprovalResultCard({ info, onClose, notify }: { info: { name: string; whatsapp: string; member_id: string; passcode: string }; onClose: () => void; notify: (m: string) => void }) {
  const link = `${window.location.origin}/warrior`;
  const text = `Welcome to Bhajrang Fitness, ${info.name}! 💪\nYour Warrior App login:\nID: ${info.member_id}\nPasscode: ${info.passcode}\nOpen: ${link}`;
  const wa = normMobile(info.whatsapp);
  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 440, textAlign: 'center' }}>
    <div className="modal-head"><div><p className="eyebrow">Approved</p><h2 style={{ margin: 0 }}>{info.name} is in 🎉</h2></div><button type="button" className="close" onClick={onClose}><X /></button></div>
    <p className="sub">Give the member these login details:</p>
    <div className="card" style={{ margin: '12px 0' }}><div className="muted" style={{ fontSize: 11 }}>Member ID</div><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{info.member_id}</div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Passcode</div><div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6 }}>{info.passcode}</div></div>
    <div style={{ display: 'grid', gap: 8 }}>
      {wa.length === 10 && <a className="button primary" style={{ justifyContent: 'center' }} href={`https://wa.me/91${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Send on WhatsApp</a>}
      <button className="button ghost" style={{ justifyContent: 'center' }} onClick={() => { void navigator.clipboard?.writeText(text); notify('Login details copied.'); }}><Copy size={15} /> Copy message</button>
    </div>
  </div></div>;
}
