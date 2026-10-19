import { useState } from 'react';
import { hub } from './api';

type Props = { settings: Record<string, string>; secrets: Record<string, boolean>; passcode: string; notify: (m: string) => void; onChanged: () => void };

function SecretField({ label, name, saved, passcode, notify, onChanged, hint }: { label: string; name: string; saved: boolean; passcode: string; notify: (m: string) => void; onChanged: () => void; hint?: string }) {
  const [v, setV] = useState('');
  const save = async (value: string) => { const r = await hub.setSecret(passcode, name, value); if (r.error) { notify(r.error); return; } setV(''); notify(value ? 'Saved securely.' : 'Removed.'); onChanged(); };
  return <div className="field"><label>{label} {saved && <span className="success">● saved</span>}</label>
    <div style={{ display: 'flex', gap: 6 }}><input type="password" autoComplete="off" value={v} onChange={e => setV(e.target.value)} placeholder={saved ? '•••••• saved — paste to replace' : 'paste here'} />
      <button className="button primary" disabled={!v.trim()} onClick={() => void save(v)}>Save</button>{saved && <button className="button ghost danger" onClick={() => void save('')}>Remove</button>}</div>
    {hint && <span className="muted" style={{ fontSize: 11 }}>{hint}</span>}</div>;
}

export function Connections({ settings, secrets, passcode, notify, onChanged }: Props) {
  const [repo, setRepo] = useState(settings.github_repo ?? '');
  const [branch, setBranch] = useState(settings.github_branch ?? 'main');
  const [check, setCheck] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const saveRepo = async () => {
    const a = await hub.setSetting(passcode, 'github_repo', repo.trim()); if (a.error) { notify(a.error); return; }
    await hub.setSetting(passcode, 'github_branch', branch.trim() || 'main'); notify('Saved.'); onChanged();
  };
  const test = async () => {
    setBusy(true); const r: any = await hub.githubCheck(passcode); setBusy(false);
    setCheck(r.ok ? `✓ Connected to ${r.repo} (${r.private ? 'private' : 'public'}). ${r.can_push ? 'Can create pull requests.' : '⚠ This token cannot write — give it Contents and Pull requests: Read & write.'}` : `✗ ${r.error}`);
  };
  const tg = settings.notify_telegram === 'true';
  const common = { passcode, notify, onChanged };
  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>GitHub — lets the Developer and Website agents change the app</span><span>{secrets.hub_github_token && settings.github_repo ? '● connected' : 'not connected'}</span></div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Changes are never written straight to your live site. An approved change becomes a pull request; it only goes live (and Render redeploys) when you press <b>Deploy</b>. Create a <i>fine-grained token</i> limited to this one repository with <b>Contents</b> and <b>Pull requests</b> set to Read &amp; write.</p>
      <div className="form-grid">
        <div className="field"><label>Repository (owner/name)</label><input value={repo} onChange={e => setRepo(e.target.value)} placeholder="yourname/bhajrang-fitness" /></div>
        <div className="field"><label>Live branch</label><input value={branch} onChange={e => setBranch(e.target.value)} /></div>
        <div className="full"><SecretField label="GitHub token" name="hub_github_token" saved={!!secrets.hub_github_token} {...common} /></div>
      </div>
      <div className="hub-actions"><button className="button primary" onClick={() => void saveRepo()}>Save repository</button><button className="button ghost" disabled={busy} onClick={() => void test()}>{busy ? 'Checking…' : 'Check connection'}</button></div>
      {check && <div className={check.startsWith('✓') ? 'hub-ok' : 'hub-warn red'}>{check}</div>}
    </div>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Facebook &amp; Instagram</span><span>{secrets.hub_meta_page_token ? '● token saved' : 'not connected'}</span></div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>From Meta for Developers: a long-lived Page access token with page posting permission, your Facebook Page ID and (for Instagram) the Instagram professional account ID linked to that Page. Instagram posts need a public image link.</p>
      <div className="form-grid">
        <div className="full"><SecretField label="Page access token" name="hub_meta_page_token" saved={!!secrets.hub_meta_page_token} {...common} /></div>
        <SecretField label="Facebook Page ID" name="hub_meta_page_id" saved={!!secrets.hub_meta_page_id} {...common} />
        <SecretField label="Instagram account ID" name="hub_meta_ig_user_id" saved={!!secrets.hub_meta_ig_user_id} {...common} />
      </div>
    </div>
    <div className="card">
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Tell me when an agent needs approval</span></div>
      <label className="hub-check"><input type="checkbox" checked={tg} onChange={async e => { const r = await hub.setSetting(passcode, 'notify_telegram', e.target.checked ? 'true' : 'false'); if (r.error) notify(r.error); onChanged(); }} />Send a Telegram alert when a new proposal is waiting (uses your existing Telegram alerts setup).</label>
      <p className="muted" style={{ fontSize: 11 }}>Email, push and WhatsApp for members use the gym’s existing send-email / send-push functions. WhatsApp opens ready-made chat links because each WhatsApp message must be sent from a template or by tapping.</p>
    </div>
  </>;
}
