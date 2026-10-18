import { useState } from 'react';
import { Check, ExternalLink, FlaskConical, Rocket, Undo2, X } from 'lucide-react';
import { hub } from './api';
import type { AgentRow, Proposal } from './types';

const KIND_LABEL: Record<string, string> = { content: 'Draft', message: 'Message to members', social_post: 'Social post', sql: 'Database change', code: 'Code change', setting: 'Setting' };
const APPROVE_LABEL: Record<string, string> = { content: 'Mark as used', message: 'Send now', social_post: 'Post now', sql: 'Run on database', code: 'Create pull request', setting: 'Apply setting' };
const STATUS_TEXT: Record<string, string> = { PENDING: 'Waiting for you', APPLYING: 'Working…', PR_OPEN: 'Pull request ready — not live yet', APPLIED: 'Done', FAILED: 'Failed', DECLINED: 'Declined' };

const Pre = ({ children, max = 2500 }: { children: string; max?: number }) => <pre className="hub-code">{children.length > max ? children.slice(0, max) + '\n…(shortened)' : children}</pre>;

function Details({ p }: { p: Proposal }) {
  const pl = p.payload;
  if (p.kind === 'content') return <>
    <Pre max={6000}>{String(pl.body ?? '')}</Pre>
    <button className="button ghost" onClick={() => void navigator.clipboard?.writeText(String(pl.body ?? ''))}>Copy text</button>
  </>;
  if (p.kind === 'message') return <>
    <div className="hub-kv"><span>Channel</span><span>{String(pl.channel)}</span>
      {pl.channel !== 'telegram' && <><span>Audience</span><span>{String(pl.audience)} — {pl.preview?.count ?? '?'} member(s){pl.preview?.reachable != null && pl.preview.reachable !== pl.preview.count ? `, ${pl.preview.reachable} reachable` : ''}</span>
        <span>Examples</span><span>{(pl.preview?.sample ?? []).join(', ') || '—'}</span></>}
      {pl.subject && <><span>Subject</span><span>{pl.subject}</span></>}</div>
    <Pre>{String(pl.text)}</Pre>
  </>;
  if (p.kind === 'social_post') return <>
    <div className="hub-kv"><span>Platform</span><span>{String(pl.platform)}</span></div>
    {pl.image_url && <img src={pl.image_url} alt="" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, border: '1px solid var(--line)' }} referrerPolicy="no-referrer" />}
    <Pre>{String(pl.caption)}</Pre>
  </>;
  if (p.kind === 'setting') return <div className="hub-kv"><span>Setting</span><code>{String(pl.key)}</code><span>Before</span><span>{pl.before == null ? '(not set)' : String(pl.before)}</span><span>After</span><span><b>{String(pl.value)}</b></span></div>;
  if (p.kind === 'sql') return <>
    {pl.description && <p style={{ fontSize: 13, margin: '8px 0' }}>{String(pl.description)}</p>}
    {(pl.reasons ?? []).length > 0 && <div className="hub-warn red"><b>Careful:</b> {(pl.reasons as string[]).join(' • ')}</div>}
    <div className="muted" style={{ fontSize: 11 }}>SQL that will run (all of it, in one transaction):</div><Pre max={9000}>{String(pl.sql)}</Pre>
    {pl.undo_sql && <><div className="muted" style={{ fontSize: 11 }}>Undo SQL (kept in case you need it):</div><Pre>{String(pl.undo_sql)}</Pre></>}
  </>;
  if (p.kind === 'code') return <>
    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Commit: {String(pl.commit_message)}</div>
    {(pl.notes ?? []).map((n: string, i: number) => <div className="hub-warn" key={i}>{n}</div>)}
    {(pl.files ?? []).map((f: any, i: number) => <details key={i} open={i === 0} style={{ margin: '8px 0' }}>
      <summary style={{ cursor: 'pointer', fontSize: 12 }}><b>{f.action === 'patch' ? 'Change' : f.action === 'write' ? 'Write' : 'Delete'}</b> <code>{f.path}</code></summary>
      {f.action === 'patch' && f.edits.map((e: any, k: number) => <div className="hub-diff" key={k} style={{ marginTop: 6 }}><pre className="hub-code del">{String(e.find).slice(0, 1800)}</pre><pre className="hub-code add">{String(e.replace).slice(0, 1800)}</pre></div>)}
      {f.action === 'write' && <Pre max={5000}>{String(f.content)}</Pre>}
    </details>)}
  </>;
  return null;
}

export function ProposalCard({ p, passcode, agents, notify, onChanged }: { p: Proposal; passcode: string; agents: AgentRow[]; notify: (m: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const agent = agents.find(a => a.key === p.agent_key);
  const run = async (what: string, f: () => Promise<any>, okMsg: string) => {
    setBusy(what); const r = await f(); setBusy('');
    if (r?.ok === false || (r?.error && r.ok !== true)) notify(String(r.error ?? r.result?.error ?? 'That did not work.').slice(0, 200)); else notify(okMsg);
    onChanged();
  };
  const needsConfirm = p.risk === 'high';
  const canAct = p.status === 'PENDING' || (p.status === 'FAILED' && ['sql', 'code', 'setting'].includes(p.kind));
  const res = p.result ?? {};
  return <div className={`hub-prop risk-${p.risk}`}>
    <div className="hub-prop-head">
      <span>{agent?.icon ?? '🤖'}</span><b>{p.title}</b>
      <span className="pill gold">{KIND_LABEL[p.kind]}</span>
      {p.risk !== 'low' && <span className={`pill ${p.risk === 'high' ? 'red' : 'gold'}`}>{p.risk} risk</span>}
      <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{agent?.name ?? p.agent_key} · {new Date(p.created_at).toLocaleString()}</span>
    </div>
    {p.summary && <p style={{ fontSize: 13, margin: '8px 0', color: '#cfd8e3' }}>{p.summary}</p>}
    <Details p={p} />
    <div className="muted" style={{ fontSize: 11, margin: '6px 0' }}>Status: <b style={{ color: p.status === 'FAILED' ? 'var(--red)' : p.status === 'APPLIED' ? 'var(--green)' : '#fff' }}>{STATUS_TEXT[p.status]}</b></div>

    {p.test_result && <div className={p.test_result.ok ? 'hub-ok' : 'hub-warn red'}>{p.test_result.ok ? '✓ ' : '✗ '}{p.test_result.note ?? p.test_result.error}</div>}
    {res.error && <div className="hub-warn red">{String(res.error)}</div>}
    {p.status === 'APPLIED' && <div className="hub-ok">
      {p.kind === 'message' && <>Sent {res.sent ?? 0}{res.failed ? `, failed ${res.failed}` : ''}{res.skipped_no_contact ? `, no contact details for ${res.skipped_no_contact}` : ''}.{res.last_error ? ` Last error: ${res.last_error}` : ''}
        {Array.isArray(res.links) && <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>{res.note}{res.links.map((l: any, i: number) => <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>WhatsApp → {l.name}</a>)}</div>}</>}
      {p.kind === 'social_post' && <>Posted. {res.facebook_id ? `Facebook id ${res.facebook_id}. ` : ''}{res.instagram_id ? `Instagram id ${res.instagram_id}.` : ''}</>}
      {p.kind === 'sql' && <>Database change applied.{res.recorded_in_repo ? ` Saved to your repo as ${res.recorded_in_repo}.` : ''}</>}
      {p.kind === 'code' && <>Merged. Your site will redeploy on Render in a few minutes. To undo, use the “Revert” button on the merged pull request on GitHub{res.pr_url ? '' : ''}.</>}
      {p.kind === 'setting' && <>Setting changed{res.before != null ? ` (was “${res.before}”)` : ''}.</>}
      {p.kind === 'content' && <>Marked as used.</>}
    </div>}
    {p.status === 'PR_OPEN' && res.pr_url && <div className="hub-ok">Pull request #{res.pr_number} is ready on GitHub. Nothing is live until you press <b>Deploy</b>. <a href={res.pr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>Review it <ExternalLink size={11} /></a></div>}

    {canAct && needsConfirm && <label className="hub-check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />I have read the SQL above and understand it can change or delete data.</label>}
    <div className="hub-actions">
      {canAct && <button className="button primary" disabled={!!busy || (needsConfirm && !confirm)} onClick={() => void run('apply', () => hub.apply(passcode, p.id, confirm), p.kind === 'code' ? 'Pull request created. Review it, then press Deploy.' : 'Done.')}><Check size={14} /> {busy === 'apply' ? 'Working…' : p.status === 'FAILED' ? 'Try again' : APPROVE_LABEL[p.kind]}</button>}
      {canAct && ['sql', 'code', 'message'].includes(p.kind) && <button className="button ghost" disabled={!!busy} onClick={() => void run('test', () => hub.testProposal(passcode, p.id), 'Test finished.')}><FlaskConical size={14} /> {busy === 'test' ? 'Testing…' : p.kind === 'sql' ? 'Test (nothing is changed)' : 'Check again'}</button>}
      {p.status === 'PR_OPEN' && <button className="button cyan" disabled={!!busy} onClick={() => void run('deploy', () => hub.deploy(passcode, p.id), 'Deployed. Render is rebuilding the site.')}><Rocket size={14} /> {busy === 'deploy' ? 'Deploying…' : 'Deploy (merge)'}</button>}
      {p.status === 'APPLIED' && p.kind === 'sql' && p.payload.undo_sql && <button className="button ghost" disabled={!!busy} onClick={() => void run('undo', () => hub.undo(passcode, p.id), 'An undo proposal was added to your queue.')}><Undo2 size={14} /> Prepare undo</button>}
      {(canAct || p.status === 'PR_OPEN') && <button className="button ghost" disabled={!!busy} onClick={() => void run('decline', async () => { const r = await hub.decline(passcode, p.id); return r.error ? { ok: false, error: r.error } : {}; }, 'Declined.')}><X size={14} /> Decline</button>}
    </div>
  </div>;
}

export function Approvals({ proposals, passcode, agents, notify, onChanged }: { proposals: Proposal[]; passcode: string; agents: AgentRow[]; notify: (m: string) => void; onChanged: () => void }) {
  const [show, setShow] = useState<'waiting' | 'history'>('waiting');
  const waiting = proposals.filter(p => ['PENDING', 'PR_OPEN', 'APPLYING'].includes(p.status) || p.status === 'FAILED');
  const rest = proposals.filter(p => !waiting.includes(p));
  const list = show === 'waiting' ? waiting : rest;
  return <>
    <div className="hub-chips" style={{ marginTop: 0 }}>
      <button className={`hub-chip ${show === 'waiting' ? '' : ''}`} style={show === 'waiting' ? { color: '#fff', borderColor: 'var(--gold)' } : undefined} onClick={() => setShow('waiting')}>Waiting ({waiting.length})</button>
      <button className="hub-chip" style={show === 'history' ? { color: '#fff', borderColor: 'var(--gold)' } : undefined} onClick={() => setShow('history')}>History ({rest.length})</button>
    </div>
    <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Agents only propose. Nothing is sent, posted, saved to the database or published until you press the button on a card.</p>
    {!list.length && <div className="empty">{show === 'waiting' ? 'Nothing is waiting for you.' : 'No past proposals yet.'}</div>}
    {list.map(p => <ProposalCard key={p.id} p={p} passcode={passcode} agents={agents} notify={notify} onChanged={onChanged} />)}
  </>;
}
