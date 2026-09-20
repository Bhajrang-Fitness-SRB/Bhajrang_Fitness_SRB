import { useCallback, useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { Activity, ArrowLeft, Flame, Mail, MessageSquare, ArrowRight, BarChart3, Bell, Calculator, Check, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, CreditCard, Download, Dumbbell, FileText, KeyRound, LayoutDashboard, Lock, LogIn, LogOut, Menu, Radio, RefreshCw, Search, Settings, ShieldAlert, ShieldCheck, Skull, Smartphone, Sparkles, Target, Trash2, UserCheck, UserPlus, Users, Wallet, X, Zap } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Papa from 'papaparse';
import { supabase, type AttendanceLog, type Billing, type Inventory, type Member, type Package, type PendingApproval, type Staff } from './lib/supabase';

type Path = '/' | '/warrior' | '/kiosk' | '/villain' | '/join';
type AdminTab = 'overview' | 'attendance' | 'join' | 'approvals' | 'members' | 'reminders' | 'notices' | 'billing' | 'expenses' | 'inventory' | 'ai' | 'diary' | 'flyers';
const VILLAIN_SESSION_KEY = 'rbf_villain_unlocked';
const ADMIN_SESSION_KEY = 'rbf_admin_pass';

const money = (value: number | null | undefined) => `₹${(value ?? 0).toLocaleString('en-IN')}`;
const daysLeft = (expiry: string | null) => expiry ? Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)) : 0;
const toCsv = (rows: Record<string, unknown>[]) => { if (!rows.length) return ''; const headers = Object.keys(rows[0]); const lines = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))]; return lines.join('\n'); };
const downloadCsv = (name: string, rows: Record<string, unknown>[]) => { const csv = toCsv(rows); if (!csv) return; const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };

function usePath(): [Path, (p: Path) => void] {
  const normalize = (p: string): Path => (p === '/administration' ? '/' : ['/warrior', '/kiosk', '/villain', '/join'].includes(p) ? (p as Path) : '/');
  const [path, setPath] = useState<Path>(() => normalize(window.location.pathname));
  useEffect(() => { const onPop = () => setPath(normalize(window.location.pathname)); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(() => { if (window.location.pathname === '/administration') window.history.replaceState({}, '', '/'); }, []);
  const navigate = useCallback((p: Path) => { window.history.pushState({}, '', p); setPath(p); }, []);
  return [path, navigate];
}

export default function App() {
  const [path, navigate] = usePath();
  const [toast, setToast] = useState('');
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('rbf_splash_seen'));
  const [splashLeaving, setSplashLeaving] = useState(false);
  useEffect(() => {
    if (!showSplash) return;
    const leave = window.setTimeout(() => setSplashLeaving(true), 1400);
    const hide = window.setTimeout(() => { setShowSplash(false); sessionStorage.setItem('rbf_splash_seen', '1'); }, 2000);
    return () => { window.clearTimeout(leave); window.clearTimeout(hide); };
  }, [showSplash]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3500); };
  const home = () => navigate('/');
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const manifestFor = path === '/warrior' ? '/manifest-warrior.webmanifest' : path === '/kiosk' ? '/manifest-kiosk.webmanifest' : '/manifest.webmanifest';
    if (link.href.endsWith(manifestFor)) return;
    link.href = manifestFor;
  }, [path]);
  return <div className="app">
    <div className="bg-watermark" />
    {showSplash && <div className={`splash${splashLeaving ? ' leaving' : ''}`}><img src="/brand/splash.jpg" alt="Bhajrang Fitness" /></div>}
    {path === '/' && <AdminGate notify={notify} />}
    {path === '/warrior' && <Portal onBack={home} notify={notify} />}
    {path === '/kiosk' && <Kiosk onBack={home} notify={notify} />}
    {path === '/villain' && <VillainGate onBack={home} notify={notify} />}
    {path === '/join' && <PublicSignup />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function Brand() { return <div className="brand"><img src="/brand/logo.png" alt="Bhajrang Fitness" className="brand-logo" /></div>; }
function Header({ onBack }: { onBack?: () => void }) { return <header className="topbar"><div style={{display:'flex',alignItems:'center',gap:18}}>{onBack && <button className="button ghost" onClick={onBack} style={{padding:'8px 10px'}}><ArrowLeft size={16}/></button>}<Brand /></div><div className="top-actions"><span className="status-dot"><i className="dot"/> SYSTEMS ONLINE</span></div></header>; }


function AdminGate({ notify }: { notify: (m: string) => void }) {
  const [passcode, setPasscode] = useState<string | null>(() => sessionStorage.getItem(ADMIN_SESSION_KEY));
  const [pass, setPass] = useState(''); const [error, setError] = useState(''); const [checking, setChecking] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setChecking(true); setError('');
    const { data } = await supabase.rpc('verify_admin_access', { p_passcode: pass });
    setChecking(false);
    if (data) { sessionStorage.setItem(ADMIN_SESSION_KEY, pass); setPasscode(pass); }
    else { setError('Incorrect passcode.'); setPass(''); }
  };
  const lock = () => { sessionStorage.removeItem(ADMIN_SESSION_KEY); setPasscode(null); setPass(''); };
  if (passcode) return <Admin passcode={passcode} onLock={lock} notify={notify} />;
  return <main className="portal-login"><div className="card" style={{ maxWidth: 380, margin: '10vh auto' }}>
    <Brand />
    <p className="eyebrow" style={{ textAlign: 'center', marginTop: 20 }}>Reception desk</p>
    <h1 className="title" style={{ textAlign: 'center' }}>Staff login.</h1>
    <p className="sub" style={{ textAlign: 'center' }}>Enter your staff or owner passcode to open the desk.</p>
    <form onSubmit={submit} style={{ marginTop: 24 }}>
      <div className="field"><label>Passcode</label><input autoFocus type="password" inputMode="numeric" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••" /></div>
      {error && <p className="error" style={{ fontSize: 12 }}>{error}</p>}
      <button className="button primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} disabled={checking}><Lock size={15} /> {checking ? 'Checking...' : 'Unlock desk'}</button>
    </form>
  </div></main>;
}
function Admin({ passcode, onLock, notify }: { passcode: string; onLock: () => void; notify: (m: string) => void }) {
 const [tab,setTab]=useState<AdminTab>('overview'); const [members,setMembers]=useState<Member[]>([]); const [pending,setPending]=useState<PendingApproval[]>([]); const [billing,setBilling]=useState<Billing[]>([]); const [attendance,setAttendance]=useState<AttendanceLog[]>([]); const [expenses,setExpenses]=useState<{id:number;expense_name:string|null;amount:number|null;expense_date:string|null}[]>([]); const [loading,setLoading]=useState(true); const [showExpense,setShowExpense]=useState(false); const [navOpen,setNavOpen]=useState(false); const selectTab=(t:AdminTab)=>{setTab(t);setNavOpen(false)};
 const load=useCallback(async()=>{setLoading(true); const [m,p,b,a,e]=await Promise.all([supabase.from('members').select('*').order('created_at',{ascending:false}),supabase.rpc('admin_list_pending_approvals',{p_passcode:passcode}),supabase.from('billing').select('*').order('created_at',{ascending:false}),supabase.from('attendance_logs').select('*').order('punch_in_time',{ascending:false}),supabase.from('expenses').select('*').order('expense_date',{ascending:false})]); if(m.data)setMembers(m.data);if(p.data)setPending(p.data);if(b.data)setBilling(b.data);if(a.data)setAttendance(a.data);if(e.data)setExpenses(e.data);setLoading(false)},[passcode]); useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),10000);return()=>window.clearInterval(timer)},[load]);
 const revenue=billing.reduce((s,x)=>s+(x.paid??0),0), expenseTotal=expenses.reduce((s,x)=>s+(x.amount??0),0), active=members.filter(m=>daysLeft(m.expiry_date)>0).length, present=attendance.filter(x=>x.punch_in_time&&new Date(x.punch_in_time).toDateString()===new Date().toDateString()&&!x.punch_out_time).length;
 const dueCount=billing.filter(x=>(x.due??0)>0).length;
 const renewalsSoon=members.filter(m=>{const d=daysLeft(m.expiry_date);return d>0&&d<=7}).length;
 const birthdaysSoon=members.filter(m=>isBirthdaySoon(m.dob,7)).length;
 const [approvingIds,setApprovingIds]=useState<number[]>([]);
 const finalizeApproval=async(item:PendingApproval,opts:{packageName:string;amount:number;discount:number;paid:number;months:number;joiningDate:string;expiryDate:string})=>{
   const id=item.id;
   if(approvingIds.includes(id))return false;
   setApprovingIds(ids=>[...ids,id]);
   const {error}=await supabase.rpc('approve_member',{p_passcode:passcode,p_approval_id:id,p_package_name:opts.packageName,p_amount:opts.amount,p_package_months:opts.months,p_discount:opts.discount,p_paid:opts.paid,p_joining_date:opts.joiningDate,p_expiry_date:opts.expiryDate});
   setApprovingIds(ids=>ids.filter(x=>x!==id));
   if(error){
     if(error.message?.includes('No pending approval')){notify(`${item.name||'This applicant'} was already approved — refreshing the list.`);void load();return false}
     notify('Approval failed. Please check the registration.');return false
   }
   setPending(p=>p.filter(x=>x.id!==id));
   notify(`${item.name||'Warrior'} approved and vault created.`);pingTelegram(`✅ Approved: ${item.name||'Warrior'} — application #${id}.`);sendCloudEmail(item.email||'',item.name||'Warrior','Welcome to Bhajrang Fitness!',`Hi ${item.name||'there'},\n\nYour membership at Bhajrang Fitness has been approved. Log in at the Warrior app with your ID and passcode (sent separately) to see your gate pass, membership status, and more.\n\nSee you at the gym!\nTeam Bhajrang Fitness`);void load();return true
 };
 return <><Header/><button className="mobile-menu-btn" onClick={()=>setNavOpen(true)}><Menu size={18}/> Menu</button><div className="shell">{navOpen&&<div className="nav-backdrop" onClick={()=>setNavOpen(false)}/>}<aside className={navOpen?'sidebar open':'sidebar'}><button className="close mobile-close" onClick={()=>setNavOpen(false)}><X/></button><div className="side-label">Reception desk</div><nav className="nav">{([['overview','Overview',LayoutDashboard],['attendance','Manual Attendance',UserCheck],['join','New Member / Join',UserPlus],['approvals','Approvals',Bell],['members','Warriors',Users],['reminders','Due & Birthday Reminders',Bell],['notices','Notices & Freeze',Bell],['billing','Billing',CreditCard],['expenses','Expenses',Wallet],['inventory','Store Inventory',Dumbbell],['diary','Diary',FileText],['flyers','Flyer Studio',Sparkles],['ai','Omni AI Hub',Sparkles]] as const).map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>selectTab(key)}><Icon size={16}/>{label}{key==='approvals'&&pending.length>0&&<span className="pill red" style={{marginLeft:'auto',padding:'3px 6px'}}>{pending.length}</span>}</button>)}</nav><div style={{marginTop:24,padding:'0 14px',display:'flex',flexDirection:'column',gap:8}}><a href="/villain" className="button ghost" style={{width:'100%',justifyContent:'center',fontSize:11}}><Skull size={13}/> Owner vault</a><button onClick={onLock} className="button ghost" style={{width:'100%',justifyContent:'center',fontSize:11}}><Lock size={13}/> Lock desk</button></div><div style={{marginTop:16,padding:'0 14px',color:'#607083',fontSize:11,lineHeight:1.6}}>Live sync active<br/><span style={{color:'#36d8d3'}}>Polling every 10 seconds</span></div><img src="/brand/team-badge.png" alt="RB Warriors" className="team-badge-mini" /></aside><main className="content">{tab==='overview'&&<Overview loading={loading} members={members} pending={pending} active={active} present={present} dueCount={dueCount} renewalsSoon={renewalsSoon} birthdaysSoon={birthdaysSoon} onApprovals={()=>selectTab('approvals')} onRefresh={load}/>} {tab==='attendance'&&<ManualAttendance members={members} attendance={attendance} notify={notify} onRefresh={load}/>} {tab==='join'&&<JoinMember passcode={passcode} notify={notify} onRefresh={load}/>} {tab==='approvals'&&<Approvals pending={pending} onApprove={finalizeApproval} approvingIds={approvingIds}/>} {tab==='members'&&<Members members={members} passcode={passcode} onRefresh={load} notify={notify}/>} {tab==='reminders'&&<Reminders members={members} billing={billing} notify={notify}/>} {tab==='notices'&&<NoticesDesk notify={notify}/>} {tab==='billing'&&<BillingView billing={billing} members={members} onRefresh={load}/>} {tab==='expenses'&&<Expenses expenses={expenses} onAdd={()=>setShowExpense(true)} onRefresh={load}/>} {tab==='inventory'&&<StoreInventory notify={notify}/>} {tab==='diary'&&<Diary notify={notify}/>} {tab==='flyers'&&<FlyerStudio/>} {tab==='ai'&&<AIHub members={members} notify={notify}/>}</main></div>{showExpense&&<ExpenseModal onClose={()=>setShowExpense(false)} onSaved={()=>{setShowExpense(false);notify('Expense logged.');void load()}}/>}</>;
}

function Overview(p:{loading:boolean;members:Member[];pending:PendingApproval[];active:number;present:number;dueCount:number;renewalsSoon:number;birthdaysSoon:number;onApprovals:()=>void;onRefresh:()=>void}) { return <><div className="page-head"><div><p className="eyebrow">Reception desk</p><h1 className="title">Good morning.</h1><p className="sub">Today's floor at a glance — financial reports live in the owner vault.</p></div><button className="button" onClick={p.onRefresh}><RefreshCw size={15}/> Sync now</button></div><div className="grid stats"><Stat icon={Users} label="Total warriors" value={p.members.length} foot={`${p.active} active memberships`} color="var(--gold)"/><Stat icon={Activity} label="On floor now" value={p.present} foot="Live attendance" color="var(--cyan)"/><Stat icon={Bell} label="Pending review" value={p.pending.length} foot="Needs your attention" color="var(--red)"/><Stat icon={Clock3} label="Dues to collect" value={p.dueCount} foot="Members with balance" color="var(--gold)"/></div><div className="grid layout-2"><div className="card"><div className="card-title">Renewals due soon <span>Next 7 days</span></div><div className="stat-value" style={{color:'var(--cyan)'}}>{p.renewalsSoon}</div><div className="result-label">Check the Reminders tab to notify them</div></div><div className="card"><div className="card-title">Birthdays this week <span>Send wishes</span></div><div className="stat-value" style={{color:'var(--gold)'}}>{p.birthdaysSoon}</div><div className="result-label">Check the Reminders tab for ready-made messages</div></div></div>{p.pending.length>0&&<div className="card" style={{marginTop:20}}><div className="card-title">Verification queue <span>Action required</span></div>{p.pending.slice(0,4).map(x=><div className="activity-item" style={{marginBottom:16}} key={x.id}><div className="activity-icon" style={{color:'var(--gold)'}}><Clock3 size={15}/></div><div className="activity-copy"><b>{x.name||'Unnamed applicant'}</b><small>{x.mobile} · {x.created_at?new Date(x.created_at).toLocaleDateString():'Recently'}</small></div><span className="pill red" style={{marginLeft:'auto'}}>NEW</span></div>)}<button className="button ghost" onClick={p.onApprovals} style={{width:'100%',justifyContent:'center',marginTop:8}}>Review queue <ArrowRight size={14}/></button></div>}</>; }
function Stat({icon:Icon,label,value,foot,color}:{icon:typeof Users;label:string;value:string|number;foot:string;color:string}){return <div className="card stat" style={{'--accent':color} as CSSProperties}><div className="stat-top"><span>{label}</span><Icon size={17} color={color}/></div><div className="stat-value">{value}</div><div className="stat-foot" style={{color}}>{foot}</div></div>}

function Approvals({pending,onApprove,approvingIds}:{pending:PendingApproval[];onApprove:(item:PendingApproval,opts:{packageName:string;amount:number;discount:number;paid:number;months:number;joiningDate:string;expiryDate:string})=>Promise<boolean>;approvingIds:number[]}){
  const exportQueue=()=>downloadCsv('pending-approvals.csv',pending as unknown as Record<string,unknown>[]);
  const [reviewing,setReviewing]=useState<PendingApproval|null>(null);
  return <><div className="page-head"><div><p className="eyebrow">Smart verification queue</p><h1 className="title">New warriors</h1><p className="sub">Review applications and open their Ghost Vault.</p></div></div><div className="card"><div className="toolbar"><div className="card-title" style={{margin:0}}>Awaiting commander review <span>{pending.length} requests</span></div><button className="button" onClick={exportQueue} disabled={!pending.length}><FileText size={15}/> Export queue</button></div>{pending.length?<div className="table-wrap"><table className="table"><thead><tr><th>Applicant</th><th>Contact</th><th>Goal</th><th>Received</th><th></th></tr></thead><tbody>{pending.map(x=><tr key={x.id}><td><b>{x.name||'Unnamed'}</b><div className="muted">#{String(x.id).padStart(4,'0')}</div></td><td>{x.mobile}<div className="muted">{x.email||'No email'}</div></td><td>{x.goal||'General fitness'}</td><td>{x.created_at?new Date(x.created_at).toLocaleDateString():'—'}</td><td><button className="button primary" disabled={approvingIds.includes(x.id)} onClick={()=>setReviewing(x)}><Check size={14}/> {approvingIds.includes(x.id)?'Approving...':'Review & Approve'}</button></td></tr>)}</tbody></table></div>:<div className="empty">No pending applications. The queue is clear.</div>}</div>
  {reviewing&&<ApprovalBillingModal application={reviewing} onClose={()=>setReviewing(null)} onApprove={async(opts)=>{const ok=await onApprove(reviewing,opts);if(ok)setReviewing(null);return ok}}/>}
  </>
}

function ApprovalBillingModal({ application, onClose, onApprove }: { application: PendingApproval; onClose: () => void; onApprove: (opts: { packageName: string; amount: number; discount: number; paid: number; months: number; joiningDate: string; expiryDate: string }) => Promise<boolean> }) {
  const { packages, loading: packagesLoading } = usePackages();
  const [packageName, setPackageName] = useState('');
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(0);
  const [ptAddon, setPtAddon] = useState(false);
  const [ptFee, setPtFee] = useState('1000');
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('');
  const [joiningDate, setJoiningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!packagesLoading && packages.length && !packageName) {
      const p = packages[0]; setPackageName(p.name); setMonths(p.duration_months); setAmount(p.price);
    }
  }, [packages, packagesLoading, packageName]);
  useEffect(() => {
    const j = new Date(joiningDate); if (isNaN(j.getTime())) return;
    const e = new Date(j); e.setMonth(e.getMonth() + Number(months || 1));
    setExpiryDate(e.toISOString().slice(0, 10));
  }, [joiningDate, months]);
  const totalAmount = amount + (ptAddon ? Number(ptFee || 0) : 0);
  const finalPaid = paid === '' ? totalAmount - Number(discount || 0) : Number(paid);
  const pickPackage = (name: string) => { const p = packages.find(x => x.name === name); if (p) { setPackageName(p.name); setMonths(p.duration_months); setAmount(p.price); } };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    const ok = await onApprove({
      packageName: ptAddon ? `${packageName} + PT` : packageName,
      amount: totalAmount, discount: Number(discount || 0), paid: finalPaid, months: Number(months),
      joiningDate, expiryDate,
    });
    setSubmitting(false); if (!ok) return;
  };
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit} style={{maxWidth:640}}>
    <div className="modal-head"><div><p className="eyebrow">Approve & bill</p><h2 style={{margin:0}}>{application.name || 'Applicant'}</h2><p className="sub">{application.mobile} · {application.goal || 'General fitness'}</p></div><button type="button" className="close" onClick={onClose}><X/></button></div>
    <div className="form-grid">
      <div className="field" style={{gridColumn:'1 / -1'}}><label>Package</label><select value={packageName} onChange={e=>pickPackage(e.target.value)} disabled={packagesLoading}>{packages.map(p=><option key={p.id} value={p.name}>{p.name} — {money(p.price)} ({p.duration_months} mo)</option>)}</select></div>
      <div className="field"><label>Joining date</label><input type="date" value={joiningDate} onChange={e=>setJoiningDate(e.target.value)} /></div>
      <div className="field"><label>Ending date</label><input type="date" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)} /></div>
      <div className="field"><label>Duration (months)</label><input type="number" value={months} onChange={e=>setMonths(Number(e.target.value))} /></div>
      <div className="field"><label>Base amount (₹)</label><input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} /></div>
    </div>
    <label style={{display:'flex',gap:8,alignItems:'center',marginTop:14,fontSize:13}}><input type="checkbox" checked={ptAddon} onChange={e=>setPtAddon(e.target.checked)} /> Add Personal Training</label>
    {ptAddon && <div className="field" style={{marginTop:8,maxWidth:200}}><label>PT fee (₹)</label><input type="number" value={ptFee} onChange={e=>setPtFee(e.target.value)} /></div>}
    <div className="form-grid" style={{marginTop:14}}>
      <div className="field"><label>Discount (₹)</label><input type="number" value={discount} onChange={e=>setDiscount(e.target.value)} /></div>
      <div className="field"><label>Amount paid now (₹)</label><input type="number" value={paid} onChange={e=>setPaid(e.target.value)} placeholder={String(totalAmount - Number(discount||0))} /></div>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:14,fontSize:14}}><span className="muted">Total</span><b>{money(totalAmount)}</b></div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:14}}><span className="muted">Due after this payment</span><b style={{color:(totalAmount-Number(discount||0)-finalPaid)>0?'var(--red)':'var(--green)'}}>{money(Math.max(0,totalAmount-Number(discount||0)-finalPaid))}</b></div>
    <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={submitting||!packageName}><Check size={15}/> {submitting?'Approving...':'Approve & create invoice'}</button></div>
  </form></div>;
}
const MEMBER_CSV_FIELDS = ['member_id','name','phone','whatsapp','email','dob','gender','blood_group','marital_status','father_name','govt_id','occupation','address','city','state','pin','gym_experience_years','joining_date','package','expiry_date','goal','height_cm','weight_kg','medical_conditions'] as const;
const CSV_HEADER_ALIASES: Record<string,string> = {memberid:'member_id',warriorid:'member_id',id:'member_id',fullname:'name',mobile:'phone',phonenumber:'phone',dateofbirth:'dob',bloodgroup:'blood_group',maritalstatus:'marital_status',fathername:'father_name',govtid:'govt_id',govid:'govt_id',pincode:'pin',zip:'pin',gymexperienceyears:'gym_experience_years',experience:'gym_experience_years',joiningdate:'joining_date',expirydate:'expiry_date',heightcm:'height_cm',height:'height_cm',weightkg:'weight_kg',weight:'weight_kg',medicalconditions:'medical_conditions',fitnessgoal:'goal'};
function normalizeHeader(h: string): string { const clean = h.trim().toLowerCase().replace(/[\s_-]+/g, ''); const direct = MEMBER_CSV_FIELDS.find(f => f.replace(/_/g, '') === clean); if (direct) return direct; return CSV_HEADER_ALIASES[clean] || h.trim(); }

function Members({members,passcode,onRefresh,notify}:{members:Member[];passcode:string;onRefresh:()=>void;notify:(m:string)=>void}){
  const [editing,setEditing]=useState<Member|null>(null);
  const [q,setQ]=useState('');
  const [preview,setPreview]=useState<Record<string,string>[]>([]);
  const [importing,setImporting]=useState(false);
  const [fileError,setFileError]=useState('');
  const filtered=members.filter(x=>(x.name||'').toLowerCase().includes(q.toLowerCase())||x.member_id.toLowerCase().includes(q.toLowerCase())||x.phone.includes(q));
  const exportAll=()=>downloadCsv('warriors-export.csv', members.map(m=>Object.fromEntries(MEMBER_CSV_FIELDS.map(f=>[f,(m as unknown as Record<string,unknown>)[f]??'']))));
  const downloadTemplate=()=>downloadCsv('warriors-import-template.csv',[Object.fromEntries(MEMBER_CSV_FIELDS.map(f=>[f,'']))]);
  const onFile=(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file) return; setFileError('');
    Papa.parse<Record<string,string>>(file,{header:true,skipEmptyLines:true,transformHeader:normalizeHeader,complete:(res)=>{
      if(res.errors.length){setFileError(`Could not read the file: ${res.errors[0].message}`);return}
      const rows=res.data.filter(r=>Object.values(r).some(v=>String(v||'').trim()!==''));
      if(!rows.length){setFileError('That file has no data rows.');return}
      setPreview(rows);
    }});
    e.target.value='';
  };
  const confirmImport=async()=>{
    setImporting(true);
    const records=preview.map(row=>{
      const rec:Record<string,unknown>={};
      MEMBER_CSV_FIELDS.forEach(f=>{const v=row[f]; if(v!==undefined&&String(v).trim()!=='') rec[f]=v;});
      if(!rec.member_id) rec.member_id=`SRB${Date.now().toString().slice(-6)}${Math.floor(10+Math.random()*89)}`;
      if(!rec.joining_date) rec.joining_date=new Date().toISOString().slice(0,10);
      return rec;
    });
    const {error,count}=await supabase.from('members').upsert(records,{onConflict:'member_id',count:'exact'});
    setImporting(false);
    if(error){notify(`Import failed: ${error.message}`);return}
    notify(`Imported/updated ${count??records.length} warriors.`);
    setPreview([]); onRefresh();
  };
  return <><div className="page-head"><div><p className="eyebrow">Cloud database manager</p><h1 className="title">Warrior directory</h1><p className="sub">Every member, one living record. Tap any row to edit. Bulk update or add via CSV.</p></div></div>
    <ChangeRequestsDesk passcode={passcode} notify={notify} />
    <div className="card" style={{marginBottom:20}}>
      <div className="card-title">Bulk update via CSV <span>Add new or update existing warriors</span></div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:preview.length?16:0}}>
        <button className="button ghost" onClick={exportAll}><Download size={15}/> Export all ({members.length})</button>
        <button className="button ghost" onClick={downloadTemplate}><FileText size={15}/> Download blank template</button>
        <label className="button primary" style={{cursor:'pointer'}}><UserPlus size={15}/> Choose CSV to import<input type="file" accept=".csv" onChange={onFile} style={{display:'none'}}/></label>
      </div>
      {fileError && <p className="error" style={{fontSize:12}}>{fileError}</p>}
      <p className="muted" style={{fontSize:11,lineHeight:1.6}}>Rows with a <b>member_id</b> matching an existing warrior update that record; rows without one create a new warrior with an auto-generated ID. Use "Export all" to get a file with the exact columns already filled in — easiest way to bulk-edit.</p>
      {preview.length>0 && <div style={{marginTop:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><b style={{fontSize:13}}>{preview.length} rows ready to import</b><div style={{display:'flex',gap:8}}><button className="button ghost" onClick={()=>setPreview([])}>Cancel</button><button className="button primary" disabled={importing} onClick={confirmImport}>{importing?'Importing...':'Confirm import'}</button></div></div>
        <div className="table-wrap" style={{maxHeight:260,overflowY:'auto'}}><table className="table"><thead><tr><th>member_id</th><th>name</th><th>phone</th><th>package</th></tr></thead><tbody>{preview.slice(0,50).map((r,i)=><tr key={i}><td>{r.member_id||<i className="muted">auto</i>}</td><td>{r.name||'—'}</td><td>{r.phone||'—'}</td><td>{r.package||'—'}</td></tr>)}</tbody></table></div>
        {preview.length>50 && <p className="muted" style={{fontSize:11,marginTop:6}}>Showing first 50 of {preview.length} rows — all will be imported.</p>}
      </div>}
    </div>
    <div className="card"><div className="toolbar"><div className="card-title" style={{margin:0}}>Registered warriors <span>{filtered.length} shown</span></div><div style={{position:'relative'}}><Search size={14} color="#728297" style={{position:'absolute',left:12,top:12}}/><input className="search" style={{paddingLeft:34}} placeholder="Search name or ID" value={q} onChange={e=>setQ(e.target.value)}/></div></div>{filtered.length?<div className="table-wrap"><table className="table"><thead><tr><th>Warrior</th><th>Phone</th><th>Package</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(x=><tr key={x.member_id} style={{cursor:'pointer'}} onClick={()=>setEditing(x)}><td><b>{x.name||'Unknown'}</b><div className="muted">{x.member_id}</div></td><td>{x.phone}</td><td>{x.package||'—'}</td><td>{x.expiry_date||'—'}</td><td><span className={daysLeft(x.expiry_date)>0?'pill':'pill red'}>{daysLeft(x.expiry_date)>0?'ACTIVE':'EXPIRED'}</span></td><td><button className="button ghost" style={{padding:'6px 8px'}} onClick={e=>{e.stopPropagation();setEditing(x)}}><Settings size={13}/></button></td></tr>)}</tbody></table></div>:<div className="empty">No warriors found.</div>}</div>{editing&&<MemberEditModal member={editing} passcode={passcode} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);notify('Member details updated.');onRefresh()}}/>}</>}
function BillingView({billing,members,onRefresh}:{billing:Billing[];members:Member[];onRefresh:()=>void}){const name=(id:string|null)=>members.find(m=>m.member_id===id)?.name||id||'Unknown';const [upiVpa,setUpiVpa]=useState('');const [gymAddress,setGymAddress]=useState('');const [showCreate,setShowCreate]=useState(false);const [showQuickQr,setShowQuickQr]=useState(false);const [viewInvoice,setViewInvoice]=useState<Billing|null>(null);useEffect(()=>{void supabase.from('gym_settings').select('key,value').in('key',['upi_vpa','gym_address']).then(({data})=>{data?.forEach(r=>{if(r.key==='upi_vpa')setUpiVpa(r.value||'');if(r.key==='gym_address')setGymAddress(r.value||'')})})},[]);return <><div className="page-head"><div><p className="eyebrow">Reception ledger</p><h1 className="title">Invoices & dues</h1><p className="sub">Chase what's owed. Full revenue and profit reports live in the owner vault.</p></div><div style={{display:'flex',gap:8}}><button className="button ghost" onClick={()=>setShowQuickQr(true)}><Smartphone size={15}/> Quick payment QR</button><button className="button primary" onClick={()=>setShowCreate(true)}><CreditCard size={15}/> Create invoice</button></div></div><div className="grid stats"><Stat icon={Clock3} label="Outstanding" value={money(billing.reduce((s,x)=>s+(x.due??0),0))} foot="Needs follow-up" color="var(--red)"/><Stat icon={FileText} label="Invoices" value={billing.length} foot="Total records" color="var(--cyan)"/><Stat icon={UserCheck} label="Fully paid" value={billing.filter(x=>(x.due??0)===0).length} foot="No balance owed" color="var(--green)"/><Stat icon={Bell} label="Needs follow-up" value={billing.filter(x=>(x.due??0)>0).length} foot="Has a balance" color="var(--gold)"/></div>{!upiVpa&&<p className="muted" style={{fontSize:12,marginBottom:10}}>Set a UPI ID in the owner vault to enable QR payments on invoices.</p>}<div className="card"><div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Warrior</th><th>Package</th><th>Paid</th><th>Method</th><th>Due</th><th></th></tr></thead><tbody>{billing.map(x=><tr key={x.id}><td>INV-{String(x.id).padStart(5,'0')}</td><td><b>{name(x.member_id)}</b><div className="muted">{x.member_id}</div></td><td>{x.package_name||'—'}</td><td style={{color:'var(--green)'}}>{money(x.paid)}</td><td><span className="pill">{x.payment_method||'UPI'}</span></td><td style={{color:(x.due??0)>0?'var(--red)':'var(--green)'}}>{money(x.due)}</td><td style={{display:'flex',gap:6}}><button className="button ghost" style={{padding:'7px 9px'}} onClick={()=>setViewInvoice(x)}><FileText size={14}/></button>{(x.due??0)>0&&<UpiQrButton vpa={upiVpa} amount={x.due??0} note={`INV-${x.id}`}/>}</td></tr>)}</tbody></table></div>{!billing.length&&<div className="empty">No billing records yet.</div>}</div>{showCreate&&<CreateInvoiceModal members={members} onClose={()=>setShowCreate(false)} onSaved={()=>{setShowCreate(false);onRefresh()}}/>}{showQuickQr&&<QuickPaymentQrModal vpa={upiVpa} onClose={()=>setShowQuickQr(false)}/>}{viewInvoice&&<InvoicePrintModal invoice={viewInvoice} memberName={name(viewInvoice.member_id)} gymAddress={gymAddress} onClose={()=>setViewInvoice(null)}/>}</>}

function QuickPaymentQrModal({ vpa, onClose }: { vpa: string; onClose: () => void }) {
  const [amount, setAmount] = useState('500'); const [note, setNote] = useState('');
  if (!vpa) return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><p className="eyebrow">Quick payment</p><h2 style={{margin:0}}>No UPI ID set</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div><p className="sub">Set your UPI ID in the owner vault's Payment Settings first.</p></div></div>;
  return <div className="modal-backdrop"><div className="modal" style={{textAlign:'center'}}>
    <div className="modal-head"><div><p className="eyebrow">Quick payment</p><h2 style={{margin:0}}>Show this to collect any amount</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div>
    <div className="form-grid" style={{textAlign:'left'}}><div className="field"><label>Amount (₹)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></div><div className="field"><label>Note (optional)</label><input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Supplement purchase"/></div></div>
    <div style={{display:'flex',justifyContent:'center',margin:'18px 0'}}><QRCodeSVG value={upiLink(vpa,'Bhajrang Fitness',Number(amount)||0,note||'Payment')} size={200}/></div>
    <p className="sub">Any UPI app scans this — no gateway, no fees.</p>
  </div></div>;
}

function CreateInvoiceModal({members,onClose,onSaved}:{members:Member[];onClose:()=>void;onSaved:()=>void}){
  const { packages, loading: packagesLoading } = usePackages();
  const [memberId,setMemberId]=useState(members[0]?.member_id||'');const [pkg,setPkg]=useState('');const [amount,setAmount]=useState('');const [paid,setPaid]=useState('');const [method,setMethod]=useState('UPI');const [saving,setSaving]=useState(false);
  useEffect(()=>{ if(!pkg && packages.length){ const p=packages[0]; setPkg(p.name); setAmount(String(p.price)); setPaid(String(p.price)); } },[packages,pkg]);
  const due=Math.max(0,Number(amount)-Number(paid));
  const pickPackage=(name:string)=>{ setPkg(name); const p=packages.find(x=>x.name===name); if(p){ setAmount(String(p.price)); setPaid(String(p.price)); } };
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!memberId)return;setSaving(true);const {error}=await supabase.from('billing').insert({member_id:memberId,package_name:pkg,amount:Number(amount),discount:0,paid:Number(paid),due,payment_date:new Date().toISOString().slice(0,10),payment_method:method});setSaving(false);if(!error)onSaved()};
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">New invoice</p><h2 style={{margin:0}}>Create invoice</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div><div className="form-grid">
    <div className="field full"><label>Warrior</label><select required value={memberId} onChange={e=>setMemberId(e.target.value)}>{members.map(m=><option key={m.member_id} value={m.member_id}>{m.name||m.member_id} ({m.member_id})</option>)}</select></div>
    <div className="field"><label>Package</label><select value={pkg} onChange={e=>pickPackage(e.target.value)} disabled={packagesLoading}>{packages.map(p=><option key={p.id} value={p.name}>{p.name} — {money(p.price)}</option>)}<option value="Personal Training">Personal Training</option><option value="Other">Other</option></select></div>
    <div className="field"><label>Total amount (₹)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
    <div className="field"><label>Paid now (₹)</label><input type="number" value={paid} onChange={e=>setPaid(e.target.value)}/></div>
    <div className="field"><label>Payment method</label><select value={method} onChange={e=>setMethod(e.target.value)}><option>UPI</option><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Other</option></select></div>
  </div><div style={{display:'flex',justifyContent:'space-between',marginTop:10}}><span className="muted">Due</span><b style={{color:due>0?'var(--red)':'var(--green)'}}>{money(due)}</b></div><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving||!members.length}>{saving?'Saving...':'Create invoice'}</button></div>{!members.length&&<p className="error" style={{fontSize:12,marginTop:10}}>No warriors on file yet — add one first.</p>}</form></div>;
}

function InvoicePrintModal({invoice,memberName,gymAddress,onClose}:{invoice:Billing;memberName:string;gymAddress:string;onClose:()=>void}){
  return <div className="modal-backdrop"><div className="modal" id="printable-invoice"><div className="modal-head no-print"><div><p className="eyebrow">Invoice</p><h2 style={{margin:0}}>INV-{String(invoice.id).padStart(5,'0')}</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div>
    <div style={{marginTop:10}}><h3 style={{margin:'0 0 2px'}}>Bhajrang Fitness</h3>{gymAddress&&<p className="muted" style={{margin:0}}>{gymAddress}</p>}</div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:18,fontSize:14}}><span className="muted">Billed to</span><b>{memberName}</b></div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:14}}><span className="muted">Member ID</span><b>{invoice.member_id}</b></div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:14}}><span className="muted">Package</span><b>{invoice.package_name||'—'}</b></div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:14}}><span className="muted">Date</span><b>{invoice.payment_date||'—'}</b></div>
    <hr style={{borderColor:'#2a3444',margin:'16px 0'}}/>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:14}}><span className="muted">Amount</span><b>{money(invoice.amount)}</b></div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:14}}><span className="muted">Paid</span><b style={{color:'var(--green)'}}>{money(invoice.paid)}</b></div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:16}}><span className="muted">Due</span><b style={{color:(invoice.due??0)>0?'var(--red)':'var(--green)'}}>{money(invoice.due)}</b></div>
    <button className="button primary full no-print" style={{marginTop:22}} onClick={()=>window.print()}><FileText size={15}/> Print / Save as PDF</button>
  </div></div>;
}
function Expenses({expenses,onAdd,onRefresh}:{expenses:{id:number;expense_name:string|null;amount:number|null;expense_date:string|null}[];onAdd:()=>void;onRefresh:()=>void}){return <><div className="page-head"><div><p className="eyebrow">Operating costs</p><h1 className="title">Expense tracker</h1><p className="sub">Know where every rupee goes.</p></div><button className="button primary" onClick={onAdd}><Wallet size={15}/> Log expense</button></div><div className="card"><div className="toolbar"><div className="card-title" style={{margin:0}}>Recent expenses</div><button className="button ghost" onClick={onRefresh}><RefreshCw size={14}/></button></div><table className="table"><thead><tr><th>Description</th><th>Date</th><th>Amount</th></tr></thead><tbody>{expenses.map(x=><tr key={x.id}><td>{x.expense_name||'General expense'}</td><td>{x.expense_date||'—'}</td><td style={{color:'var(--red)'}}>{money(x.amount)}</td></tr>)}</tbody></table>{!expenses.length&&<div className="empty">No expenses logged.</div>}</div></>}
function ExpenseModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){const [name,setName]=useState('');const [amount,setAmount]=useState('');const [saving,setSaving]=useState(false);const save=async(e:FormEvent)=>{e.preventDefault();setSaving(true);const {error}=await supabase.from('expenses').insert({expense_name:name,amount:Number(amount)});setSaving(false);if(!error)onSaved()};return <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><p className="eyebrow">New ledger entry</p><h2 style={{margin:0}}>Log expense</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div><div className="form-grid"><div className="field full"><label>Description</label><input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Electricity bill"/></div><div className="field"><label>Amount</label><input required type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></div></div><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Saving...':'Save expense'}</button></div></form></div>}

function AIHub({members,notify}:{members:Member[];notify:(m:string)=>void}){const [member,setMember]=useState('');const [goal,setGoal]=useState('Build a balanced 4-day strength program with warm-ups and progression.');const [plan,setPlan]=useState<{title:string;days:string[];notes:string}|null>(null);const [aiText,setAiText]=useState('');const [engine,setEngine]=useState('');const [loading,setLoading]=useState(false);const generate=async()=>{const target=members.find(m=>m.member_id===member)?.name||'your warrior';setLoading(true);setAiText('');setEngine('');try{const {data}=await supabase.functions.invoke('ai-coach',{body:{prompt:`Write a training plan for ${target}. Their request: ${goal}. Format as a short numbered day-by-day plan with brief notes.`}});if(data?.configured&&data?.text){setAiText(data.text);setEngine(data.engine);setPlan(null);notify(`AI plan drafted via ${data.engine==='gemini'?'Gemini':'Groq'}.`);setLoading(false);return}}catch{/* fall through to template */}setPlan({title:`${target}'s Strength Protocol`,days:['Day 01 · Upper push — chest, shoulders, triceps','Day 02 · Lower strength — quads, hamstrings, core','Day 03 · Recovery — mobility and 25 min zone 2','Day 04 · Upper pull — back, biceps, rear delts'],notes:'Start every session with 8 minutes of movement prep. Add one rep before adding load. Sleep 7–8 hours and hydrate consistently.'});notify('AI plan drafted (template mode — add a Gemini or Groq key for real AI-written plans).');setLoading(false)};return <><div className="page-head"><div><p className="eyebrow">Gemini + Groq fallback core</p><h1 className="title">Omni AI Hub</h1><p className="sub">Draft a plan, then assign it to a warrior.</p></div><span className="pill">{engine?engine.toUpperCase()+' LIVE':'AI READY'}</span></div><div className="grid layout-2"><div className="card"><div className="field"><label>Assign to warrior</label><select value={member} onChange={e=>setMember(e.target.value)}><option value="">Select a warrior</option>{members.map(m=><option key={m.member_id} value={m.member_id}>{m.name||m.member_id} · {m.member_id}</option>)}</select></div><div className="field" style={{marginTop:16}}><label>Coach prompt</label><textarea value={goal} onChange={e=>setGoal(e.target.value)}/></div><button className="button cyan" style={{marginTop:18}} disabled={loading} onClick={generate}><Sparkles size={15}/> {loading?'Generating...':'Generate training plan'}</button></div><div className="card">{aiText?<><div className="card-title">AI-generated plan<span>{engine}</span></div><p className="sub" style={{whiteSpace:'pre-wrap',lineHeight:1.7}}>{aiText}</p><button className="button primary" style={{marginTop:10}} onClick={()=>notify('Plan assigned to the selected warrior.')}>Assign plan</button></>:plan?<><div className="card-title">{plan.title}<span>Template</span></div><div className="activity">{plan.days.map(x=><div className="activity-item" key={x}><div className="activity-icon"><Dumbbell size={15}/></div><div className="activity-copy">{x}</div></div>)}</div><p className="sub" style={{lineHeight:1.6}}>{plan.notes}</p><button className="button primary" style={{marginTop:10}} onClick={()=>notify('Plan assigned to the selected warrior.')}>Assign plan</button></>:<div className="empty"><Sparkles size={24} style={{marginBottom:10}}/><br/>Your generated plan will appear here.</div>}</div></div></>}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(isStandalone);
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const install = async () => { if (!deferred) return; await deferred.prompt(); const choice = await deferred.userChoice; if (choice.outcome === 'accepted') setInstalled(true); setDeferred(null); };
  return { canInstall: !!deferred, installed, isIOS, install };
}
function InstallAppBanner() {
  const { canInstall, installed, isIOS, install } = useInstallPrompt();
  const [showIosHelp, setShowIosHelp] = useState(false);
  if (installed) return null;
  if (canInstall) return <button className="button primary full" style={{width:'100%',justifyContent:'center',marginBottom:14}} onClick={install}><Download size={15}/> Install Bhajrang Fitness app</button>;
  if (isIOS) return <>
    <button className="button ghost full" style={{width:'100%',justifyContent:'center',marginBottom:14}} onClick={()=>setShowIosHelp(true)}><Download size={15}/> Add to Home Screen</button>
    {showIosHelp && <div className="modal-backdrop" onClick={()=>setShowIosHelp(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">Install on iPhone</p><h2 style={{margin:0}}>Add to Home Screen</h2></div><button type="button" className="close" onClick={()=>setShowIosHelp(false)}><X/></button></div><ol style={{paddingLeft:18,lineHeight:2,fontSize:14}}><li>Tap the <b>Share</b> button in Safari's toolbar</li><li>Scroll down and tap <b>Add to Home Screen</b></li><li>Tap <b>Add</b> — the app icon appears on your home screen</li></ol></div></div>}
  </>;
  return null;
}
function Portal({onBack,notify}:{onBack:()=>void;notify:(m:string)=>void}){const [memberId,setMemberId]=useState('');const [passcode,setPasscode]=useState('');const [member,setMember]=useState<Member|null>(null);const [loginError,setLoginError]=useState('');const login=async(e:FormEvent)=>{e.preventDefault();setLoginError('');const {data,error}=await supabase.rpc('verify_member_login',{p_member_id:memberId.trim(),p_passcode:passcode.trim()});const row=Array.isArray(data)?data[0]:data;if(error||!row){setLoginError('Warrior ID or passcode not recognised.');return}setMember(row as Member);};return <><Header onBack={onBack}/>{!member?<main className="portal-login"><div className="card"><p className="eyebrow">Warrior portal</p><h1 className="title">Enter the vault.</h1><p className="sub">Use the ID and secret passcode sent when your membership was approved.</p><InstallAppBanner/><form onSubmit={login} style={{marginTop:6}}><div className="field"><label>Warrior ID</label><input required value={memberId} onChange={e=>setMemberId(e.target.value.toUpperCase())} placeholder="e.g. SRB92900001"/></div><div className="field" style={{marginTop:14}}><label>Secret passcode</label><input required type="password" inputMode="numeric" maxLength={4} value={passcode} onChange={e=>setPasscode(e.target.value)} placeholder="4 digits"/></div>{loginError&&<p className="error" style={{fontSize:12}}>{loginError}</p>}<button className="button cyan" style={{width:'100%',justifyContent:'center',marginTop:20}}><LogIn size={15}/> Unlock my portal</button></form><a href="/join" className="button ghost" style={{width:'100%',justifyContent:'center',marginTop:14}}><UserPlus size={15}/> New here? Join Bhajrang Fitness</a></div></main>:<MemberPortal member={member} onLogout={()=>setMember(null)} notify={notify}/>}</>}
function MemberPortal({member,onLogout,notify}:{member:Member;onLogout:()=>void;notify:(m:string)=>void}){
  const [history,setHistory]=useState<AttendanceLog[]>([]);
  const [showRenew,setShowRenew]=useState(false);
  const [showFreeze,setShowFreeze]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const [notices,setNotices]=useState<{id:string;title:string;body:string}[]>([]);
  const [brochureUrl,setBrochureUrl]=useState('');
  useEffect(()=>{void supabase.from('gym_settings').select('value').eq('key','brochure_url').maybeSingle().then(({data})=>setBrochureUrl(data?.value||''))},[]);
  useEffect(()=>{void supabase.from('attendance_logs').select('*').eq('member_id',member.member_id).order('punch_in_time',{ascending:false}).limit(8).then(({data})=>setHistory(data??[]))},[member.member_id]);
  useEffect(()=>{void supabase.from('notices').select('id,title,body').eq('active',true).order('created_at',{ascending:false}).limit(3).then(({data})=>setNotices(data??[]))},[]);
  return <><main className="portal"><InstallAppBanner/>{notices.length>0&&<div className="card" style={{marginBottom:18,borderColor:'var(--gold)'}}><div className="card-title"><Bell size={15} color="var(--gold)"/> Gym notices</div>{notices.map(n=><div key={n.id} style={{marginBottom:8}}><b>{n.title}</b>{n.body&&<p className="muted" style={{margin:'2px 0 0'}}>{n.body}</p>}</div>)}</div>}<div className="portal-head"><div><p className="eyebrow">Welcome back, warrior</p><h1 className="title">{member.name||member.member_id}</h1><p className="sub">{member.member_id} · {member.package||'Active member'}</p></div><button className="button ghost" onClick={onLogout}><LogOut size={15}/> Lock vault</button></div><div className="grid portal-grid"><div className="card" style={{textAlign:'center'}}><div className="card-title">Digital gate pass <span>Scan at entrance</span></div><div className="qr"><QRCodeSVG value={member.member_id} size={190}/></div><p className="sub">Show this code to the AI kiosk</p></div><div className="card"><div className="card-title">Membership status <span className="pill">{daysLeft(member.expiry_date)>0?'ACTIVE':'EXPIRED'}</span></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'end'}}><div><div className="stat-value" style={{color:'var(--cyan)'}}>{daysLeft(member.expiry_date)}</div><div className="result-label">days remaining</div></div><Target size={42} color="var(--gold)"/></div><div className="progress"><i style={{width:`${Math.min(100,Math.max(4,daysLeft(member.expiry_date)/30*100))}%`}}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:14,fontSize:12}}><span className="muted">Started</span><b>{member.joining_date||'—'}</b><span className="muted">Expires</span><b>{member.expiry_date||'—'}</b></div><div style={{display:'flex',gap:8,marginTop:16}}><button className="button primary" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowRenew(true)}><CreditCard size={15}/> Renew</button><button className="button ghost" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowFreeze(true)}><Clock3 size={15}/> Freeze</button></div><button className="button ghost" style={{width:'100%',justifyContent:'center',marginTop:8}} onClick={()=>setShowEdit(true)}><Settings size={15}/> Update my details</button>{brochureUrl&&<a href={brochureUrl} target="_blank" rel="noreferrer" className="button ghost" style={{width:'100%',justifyContent:'center',marginTop:8}}><FileText size={15}/> Gym brochure & packages</a>}</div><div className="card"><div className="card-title">My recent attendance <span>Last 8 visits</span></div>{history.length?<div className="activity">{history.map(x=><div className="activity-item" key={x.id}><div className="activity-icon"><UserCheck size={15}/></div><div className="activity-copy">{x.punch_in_time?new Date(x.punch_in_time).toLocaleDateString():'—'}<small>{x.punch_in_time?new Date(x.punch_in_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''} {x.punch_out_time?`→ ${new Date(x.punch_out_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:'(still in)'}</small></div></div>)}</div>:<div className="empty">No visits logged yet.</div>}</div></div><ProgressPhotos memberId={member.member_id} notify={notify}/><Calculators notify={notify}/></main>{showRenew&&<RenewModal member={member} onClose={()=>setShowRenew(false)} onSaved={()=>notify('Renewal request sent — pay via the QR shown, or at reception.')}/>}{showFreeze&&<FreezeModal member={member} onClose={()=>setShowFreeze(false)} onSaved={()=>{setShowFreeze(false);notify('Freeze request sent to reception.')}}/>}{showEdit&&<MemberSelfEdit member={member} onClose={()=>setShowEdit(false)} notify={notify}/>}</>;
}
function FreezeModal({member,onClose,onSaved}:{member:Member;onClose:()=>void;onSaved:()=>void}){
  const [reason,setReason]=useState('');const [saving,setSaving]=useState(false);
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);const {error}=await supabase.from('freeze_requests').insert({member_id:member.member_id,reason});setSaving(false);if(!error)onSaved()};
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Freeze request</p><h2 style={{margin:0}}>Pause your membership</h2><p className="sub">Reception will review and confirm your freeze period.</p></div><button type="button" className="close" onClick={onClose}><X/></button></div><div className="field full"><label>Reason (optional)</label><textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. traveling for 3 weeks"/></div><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Sending...':'Send request'}</button></div></form></div>;
}
function RenewModal({member,onClose,onSaved}:{member:Member;onClose:()=>void;onSaved:()=>void}){
  const { packages, loading: packagesLoading } = usePackages();
  const [pkg,setPkg]=useState('');const [saving,setSaving]=useState(false);const [submitted,setSubmitted]=useState(false);const [vpa,setVpa]=useState('');
  useEffect(()=>{ if(!pkg && packages.length) setPkg(packages[0].name); },[packages,pkg]);
  const price = packages.find(p=>p.name===pkg)?.price ?? 0;
  useEffect(()=>{void supabase.from('gym_settings').select('value').eq('key','upi_vpa').maybeSingle().then(({data})=>setVpa(data?.value||''))},[]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);const {error}=await supabase.from('billing').insert({member_id:member.member_id,package_name:pkg,amount:price,discount:0,paid:0,due:price,payment_date:new Date().toISOString().slice(0,10)});setSaving(false);if(!error){setSubmitted(true);onSaved()}};
  if(submitted) return <div className="modal-backdrop"><div className="modal" style={{textAlign:'center'}}><div className="modal-head"><div><p className="eyebrow">Request sent</p><h2 style={{margin:0}}>Pay {money(price)} to activate</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div>{vpa?<><div style={{display:'flex',justifyContent:'center',margin:'16px 0'}}><QRCodeSVG value={upiLink(vpa,'Bhajrang Fitness',price,`${member.member_id} ${pkg}`)} size={180}/></div><p className="sub">Scan with any UPI app, then show reception the payment confirmation.</p></>:<p className="sub">Reception will share a payment link or collect this in person.</p>}<button className="button primary full" style={{marginTop:16}} onClick={onClose}>Done</button></div></div>;
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Renewal request</p><h2 style={{margin:0}}>Renew your membership</h2><p className="sub">This creates a pending invoice you can pay instantly via UPI, or at reception.</p></div><button type="button" className="close" onClick={onClose}><X/></button></div><div className="form-grid"><div className="field full"><label>Choose package</label><select value={pkg} onChange={e=>setPkg(e.target.value)} disabled={packagesLoading}>{packages.map(p=><option key={p.id} value={p.name}>{p.name} — {money(p.price)}</option>)}</select></div></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}><span className="muted">Amount due</span><b>{money(price)}</b></div><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving||!pkg}>{saving?'Sending...':'Send request'}</button></div></form></div>;
}
function Calculators({notify}:{notify:(m:string)=>void}){const [height,setHeight]=useState('175');const [weight,setWeight]=useState('75');const bmi=(Number(weight)/(Number(height)/100)**2||0).toFixed(1);const [oneRmWeight,setOneRmWeight]=useState('60');const [reps,setReps]=useState('8');const oneRm=(Number(oneRmWeight)*(1+Number(reps)/30)||0).toFixed(1);const [age,setAge]=useState('28');const bmr=(10*Number(weight)+6.25*Number(height)-5*Number(age)+5||0).toFixed(0);const [activity,setActivity]=useState('1.55');const tdee=(Number(bmr)*Number(activity)||0).toFixed(0);const [neck,setNeck]=useState('38');const [waist,setWaist]=useState('85');const [sex,setSex]=useState('Male');const [hip,setHip]=useState('95');const bodyFat=sex==='Male'?(495/(1.0324-0.19077*Math.log10(Number(waist)-Number(neck))+0.15456*Math.log10(Number(height)))-450):(495/(1.29579-0.35004*Math.log10(Number(waist)+Number(hip)-Number(neck))+0.22100*Math.log10(Number(height)))-450);return <section style={{marginTop:32}}><div className="card-title">Performance lab <span>Personal analytics</span></div><div className="grid calc-grid"><div className="card"><div className="card-title"><BarChart3 size={16} color="var(--cyan)"/> BMI engine</div><div className="form-grid"><div className="field"><label>Height (cm)</label><input type="number" value={height} onChange={e=>setHeight(e.target.value)}/></div><div className="field"><label>Weight (kg)</label><input type="number" value={weight} onChange={e=>setWeight(e.target.value)}/></div></div><div className="calc-result">{bmi}</div><div className="result-label">{Number(bmi)<18.5?'Below range':Number(bmi)<25?'Healthy range':'Above range'}</div></div><div className="card"><div className="card-title"><Zap size={16} color="var(--gold)"/> 1RM estimator</div><div className="form-grid"><div className="field"><label>Weight (kg)</label><input type="number" value={oneRmWeight} onChange={e=>setOneRmWeight(e.target.value)}/></div><div className="field"><label>Reps</label><input type="number" value={reps} onChange={e=>setReps(e.target.value)}/></div></div><div className="calc-result">{oneRm} kg</div><div className="result-label">Estimated one-rep max</div></div><div className="card"><div className="card-title"><Activity size={16} color="var(--green)"/> BMR baseline</div><div className="field"><label>Age</label><input type="number" value={age} onChange={e=>setAge(e.target.value)}/></div><div className="calc-result">{bmr}</div><div className="result-label">Estimated calories / day</div></div><div className="card"><div className="card-title"><Flame size={16} color="var(--red)"/> TDEE (with activity)</div><div className="field"><label>Activity level</label><select value={activity} onChange={e=>setActivity(e.target.value)}><option value="1.2">Sedentary (desk job)</option><option value="1.375">Light (1-3 workouts/week)</option><option value="1.55">Moderate (3-5 workouts/week)</option><option value="1.725">Heavy (6-7 workouts/week)</option><option value="1.9">Athlete (2x/day)</option></select></div><div className="calc-result">{tdee}</div><div className="result-label">Calories to maintain current weight</div></div><div className="card"><div className="card-title"><Target size={16} color="var(--gold)"/> Body fat % (Navy method)</div><div className="form-grid"><div className="field"><label>Sex</label><select value={sex} onChange={e=>setSex(e.target.value)}><option>Male</option><option>Female</option></select></div><div className="field"><label>Neck (cm)</label><input type="number" value={neck} onChange={e=>setNeck(e.target.value)}/></div><div className="field"><label>Waist (cm)</label><input type="number" value={waist} onChange={e=>setWaist(e.target.value)}/></div>{sex==='Female'&&<div className="field"><label>Hip (cm)</label><input type="number" value={hip} onChange={e=>setHip(e.target.value)}/></div>}</div><div className="calc-result">{isFinite(bodyFat)&&bodyFat>0?bodyFat.toFixed(1):'—'}%</div><div className="result-label">Estimated body fat</div></div><div className="card"><div className="card-title"><DropletIcon/> Hydration target</div><div className="calc-result">{(Number(weight)*.035).toFixed(1)} L</div><div className="result-label">Daily baseline · add 500ml per workout</div></div><div className="card"><div className="card-title"><HeartIcon/> Cardio HR zone</div><div className="calc-result">{Math.round(208-.7*Number(age))}</div><div className="result-label">Estimated max heart rate</div></div><div className="card"><div className="card-title"><Calculator size={16} color="var(--blue)"/> Macro guide</div><div className="calc-result">{Number(weight)*2}g</div><div className="result-label">Daily protein target</div><div style={{display:'flex',justifyContent:'space-between',marginTop:10,fontSize:12}}><span className="muted">Carbs</span><b>{Math.round(Number(tdee)*0.4/4)}g</b><span className="muted">Fat</span><b>{Math.round(Number(tdee)*0.25/9)}g</b></div></div></div></section>}
function DropletIcon(){return <span style={{color:'var(--cyan)'}}>◈</span>} function HeartIcon(){return <span style={{color:'var(--red)'}}>♡</span>}

function Kiosk({onBack,notify}:{onBack:()=>void;notify:(m:string)=>void}){const [code,setCode]=useState('');const [message,setMessage]=useState('');const [logs,setLogs]=useState<{id:string;name:string;action:string;time:string}[]>([]);const scan=async(e:FormEvent)=>{e.preventDefault();if(!code.trim())return;const {data}=await supabase.from('members').select('*').eq('member_id',code.trim().toUpperCase()).maybeSingle();if(!data){setMessage('ACCESS DENIED · ID NOT FOUND');notify('Warrior ID not found.');setCode('');return}const today=new Date().toISOString().slice(0,10);const existing=await supabase.from('attendance_logs').select('*').eq('member_id',data.member_id).gte('punch_in_time',`${today}T00:00:00`).order('punch_in_time',{ascending:false}).limit(1).maybeSingle();let action='CHECK-IN';if(existing.data&&!existing.data.punch_out_time){await supabase.from('attendance_logs').update({punch_out_time:new Date().toISOString(),status:'CHECKED_OUT'}).eq('id',existing.data.id);action='CHECK-OUT'}else{await supabase.from('attendance_logs').insert({member_id:data.member_id,status:'CHECKED_IN'});}setMessage(`${action} · ${data.name||data.member_id}`);setLogs(x=>[{id:data.member_id,name:data.name||data.member_id,action,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})},...x].slice(0,6));setCode('');};return <main className="kiosk"><div className="kiosk-inner"><div className="kiosk-head"><Brand/><div style={{display:'flex',alignItems:'center',gap:15}}><span className="status-dot"><i className="dot"/> SCANNER READY</span><button className="button ghost" onClick={onBack}><ArrowLeft size={15}/> Exit</button></div></div><div className="scan-box"><p className="kicker">BHAJRANG AI KIOSK // GATE 01</p><h1 className="title">Scan to enter.</h1><p className="sub">Present your QR pass or type your Warrior ID.</p><div className="scan-frame"><div className="scan-line"/><Radio size={48} strokeWidth={1}/></div><form onSubmit={scan}><input autoFocus className="kiosk-input" value={code} onChange={e=>setCode(e.target.value)} placeholder="WARRIOR ID"/></form>{message&&<p className={message.includes('DENIED')?'error':'success'} style={{fontSize:13,letterSpacing:'.08em',marginTop:20}}>{message}</p>}<div className="log-list" style={{textAlign:'left'}}>{logs.length>0&&<p className="eyebrow" style={{margin:'18px 0 0'}}>Live action log</p>}{logs.map(x=><div className="log" key={x.id+x.time}><span><b>{x.name}</b> · {x.action}</span><span>{x.time}</span></div>)}</div></div></div></main>}

function VillainGate({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [passcode, setPasscode] = useState<string | null>(() => sessionStorage.getItem(VILLAIN_SESSION_KEY));
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setChecking(true); setError('');
    const { data } = await supabase.rpc('verify_owner_passcode', { p_passcode: pass });
    setChecking(false);
    if (data === true) { sessionStorage.setItem(VILLAIN_SESSION_KEY, pass); setPasscode(pass); notify('Villain vault unlocked.'); }
    else { setError('Incorrect passcode.'); setPass(''); }
  };
  if (passcode) return <VillainVault onBack={onBack} notify={notify} passcode={passcode} onLock={() => { sessionStorage.removeItem(VILLAIN_SESSION_KEY); setPasscode(null); }} />;
  return <main className="portal-login"><div className="card" style={{maxWidth:380,margin:'8vh auto'}}>
    <div style={{display:'flex',justifyContent:'center',marginBottom:14}}><img src="/brand/owner-photo.png" alt="" className="villain-photo" /></div>
    <p className="eyebrow" style={{textAlign:'center'}}>Owner only</p>
    <h1 className="title" style={{textAlign:'center'}}>Villain Vault</h1>
    <p className="sub" style={{textAlign:'center'}}>This is your private master control. Enter the passcode.</p>
    <form onSubmit={submit} style={{marginTop:24}}>
      <div className="field"><label>Passcode</label><input autoFocus type="password" inputMode="numeric" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••" /></div>
      {error && <p className="error" style={{fontSize:12}}>{error}</p>}
      <button className="button primary" style={{width:'100%',justifyContent:'center',marginTop:18}} disabled={checking}><Lock size={15}/> {checking?'Checking...':'Unlock vault'}</button>
    </form>
    <button className="button ghost" style={{width:'100%',justifyContent:'center',marginTop:10}} onClick={onBack}><ArrowLeft size={14}/> Back to desk</button>
    <p className="muted" style={{fontSize:11,marginTop:16,textAlign:'center',lineHeight:1.6}}><ShieldAlert size={12} style={{verticalAlign:'middle',marginRight:4}}/>The passcode is checked on the server and never stored in this app's code — but it's still a single shared secret, not a personal account. Keep it private and change it from the Settings tab.</p>
  </div></main>;
}

function VillainVault({ onBack, onLock, notify, passcode }: { onBack: () => void; onLock: () => void; notify: (m: string) => void; passcode: string }) {
  const [tab, setTab] = useState<'overview' | 'finance' | 'staff' | 'vault' | 'packages' | 'settings' | 'data'>('overview');
  const [members, setMembers] = useState<Member[]>([]);
  const [billing, setBilling] = useState<Billing[]>([]);
  const [expenses, setExpenses] = useState<{ id: number; expense_name: string | null; amount: number | null; expense_date: string | null }[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const [m, b, e, a, s] = await Promise.all([
      supabase.from('members').select('*'),
      supabase.from('billing').select('*'),
      supabase.from('expenses').select('*'),
      supabase.from('attendance_logs').select('*').order('punch_in_time', { ascending: false }).limit(50),
      supabase.rpc('admin_list_staff', { p_passcode: passcode }),
    ]);
    setMembers(m.data ?? []); setBilling(b.data ?? []); setExpenses(e.data ?? []); setAttendance(a.data ?? []); setStaff((s.data as Staff[]) ?? []);
    setLoading(false);
  }, [passcode]);
  useEffect(() => { void load(); }, [load]);
  const revenue = billing.reduce((s, x) => s + (x.paid ?? 0), 0);
  const expenseTotal = expenses.reduce((s, x) => s + (x.amount ?? 0), 0);
  const net = revenue - expenseTotal;
  const [navOpen,setNavOpen]=useState(false);
  return <><Header onBack={onBack} /><button className="mobile-menu-btn" onClick={()=>setNavOpen(true)}><Menu size={18}/> Menu</button><div className="shell">{navOpen&&<div className="nav-backdrop" onClick={()=>setNavOpen(false)}/>}<aside className={navOpen?'sidebar open':'sidebar'}>
    <button className="close mobile-close" onClick={()=>setNavOpen(false)}><X/></button>
    <div className="side-label">Villain vault</div>
    <nav className="nav">
      {([['overview','Master overview',Skull],['finance','Financial Planner',BarChart3],['staff','Staff control',UserPlus],['vault','Member Vault Access',KeyRound],['packages','Packages',Dumbbell],['settings','Payment Settings',CreditCard],['data','Data & exports',Download]] as const).map(([key,label,Icon]) =>
        <button key={key} className={tab===key?'active':''} onClick={()=>{setTab(key);setNavOpen(false)}}><Icon size={16}/>{label}</button>)}
    </nav>
    <button className="button ghost" style={{margin:'20px 14px',width:'calc(100% - 28px)'}} onClick={onLock}><Lock size={14}/> Lock vault</button>
  </aside><main className="content">
    {tab === 'overview' && <>
      <div className="page-head"><div><p className="eyebrow">Owner-only intelligence</p><h1 className="title">Everything, at once.</h1><p className="sub">No filtering, no staff-facing limits — the full picture.</p></div><button className="button" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
      <div className="grid stats">
        <Stat icon={Users} label="Total warriors" value={members.length} foot="All-time registrations" color="var(--gold)" />
        <Stat icon={CircleDollarSign} label="Gross revenue" value={money(revenue)} foot="Collected across all invoices" color="var(--green)" />
        <Stat icon={Wallet} label="Total expenses" value={money(expenseTotal)} foot="All logged outflow" color="var(--red)" />
        <Stat icon={BarChart3} label="Net position" value={money(net)} foot={net >= 0 ? 'Profitable' : 'Running at a loss'} color={net >= 0 ? 'var(--cyan)' : 'var(--red)'} />
      </div>
      {loading ? <div className="empty">Loading vault data...</div> : <div className="card"><div className="card-title">Recent floor activity <span>Last 50 punches</span></div>{attendance.length ? <div className="activity">{attendance.slice(0,10).map(x=><div className="activity-item" key={x.id}><div className="activity-icon"><UserCheck size={15}/></div><div className="activity-copy"><b>{x.member_id}</b> {x.punch_out_time?'completed a session':'checked in'}<small>{x.punch_in_time?new Date(x.punch_in_time).toLocaleString():''}</small></div></div>)}</div> : <div className="empty">No attendance yet.</div>}</div>}
    </>}
    {tab === 'staff' && <StaffControl staff={staff} passcode={passcode} onRefresh={load} notify={notify} />}
    {tab === 'vault' && <MemberVaultAccess members={members} passcode={passcode} notify={notify} />}
    {tab === 'packages' && <PackageManager passcode={passcode} notify={notify} />}
    {tab === 'packages' && <PackageManager passcode={passcode} notify={notify} />}
    {tab === 'settings' && <PaymentSettings passcode={passcode} notify={notify} />}
    {tab === 'finance' && <FinancePlanner billing={billing} expenses={expenses} members={members} />}
    {tab === 'data' && <>
      <div className="page-head"><div><p className="eyebrow">Full data control</p><h1 className="title">Data & exports</h1><p className="sub">Download raw records for backup or offline analysis.</p></div></div>
      <div className="grid layout-2">
        <div className="card"><div className="card-title">Members <span>{members.length} records</span></div><button className="button primary" onClick={()=>downloadCsv('members.csv',members as unknown as Record<string,unknown>[])}><Download size={15}/> Export members CSV</button></div>
        <div className="card"><div className="card-title">Billing <span>{billing.length} records</span></div><button className="button primary" onClick={()=>downloadCsv('billing.csv',billing as unknown as Record<string,unknown>[])}><Download size={15}/> Export billing CSV</button></div>
        <div className="card"><div className="card-title">Expenses <span>{expenses.length} records</span></div><button className="button primary" onClick={()=>downloadCsv('expenses.csv',expenses as unknown as Record<string,unknown>[])}><Download size={15}/> Export expenses CSV</button></div>
        <div className="card"><div className="card-title">Attendance <span>{attendance.length} records</span></div><button className="button primary" onClick={()=>downloadCsv('attendance.csv',attendance as unknown as Record<string,unknown>[])}><Download size={15}/> Export attendance CSV</button></div>
      </div>
    </>}
  </main></div></>;
}

function StaffControl({ staff, passcode, onRefresh, notify }: { staff: Staff[]; passcode: string; onRefresh: () => void; notify: (m: string) => void }) {
  const [form, setForm] = useState({ name: '', role: 'Trainer', phone: '', passcode: '' });
  const [saving, setSaving] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.rpc('admin_add_staff', { p_passcode: passcode, p_name: form.name, p_role: form.role, p_phone: form.phone, p_staff_passcode: form.passcode || null });
    setSaving(false);
    if (error) { notify('Could not add staff member.'); return; }
    setForm({ name: '', role: 'Trainer', phone: '', passcode: '' }); notify(`${form.name} added to staff.`); onRefresh();
  };
  const toggle = async (s: Staff) => { await supabase.rpc('admin_toggle_staff', { p_passcode: passcode, p_staff_id: s.id }); onRefresh(); };
  const remove = async (s: Staff) => { await supabase.rpc('admin_remove_staff', { p_passcode: passcode, p_staff_id: s.id }); notify(`${s.name} removed.`); onRefresh(); };
  return <><div className="page-head"><div><p className="eyebrow">Owner control</p><h1 className="title">Staff accounts</h1><p className="sub">Add, disable, or remove staff who can use the Administration desk.</p></div></div>
    <div className="grid layout-2">
      <div className="card"><div className="card-title">Add staff member</div>
        <form onSubmit={add} className="form-grid">
          <div className="field"><label>Full name</label><input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
          <div className="field"><label>Role</label><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}><option>Trainer</option><option>Front Desk</option><option>Nutrition Coach</option><option>Manager</option></select></div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div>
          <div className="field"><label>Login passcode</label><input value={form.passcode} onChange={e=>setForm(f=>({...f,passcode:e.target.value}))} placeholder="Auto-generated if blank" /></div>
          <button className="button primary full" disabled={saving} style={{gridColumn:'1 / -1'}}><UserPlus size={15}/> {saving?'Saving...':'Add staff member'}</button>
        </form>
      </div>
      <div className="card"><div className="card-title">Current staff <span>{staff.length} on file</span></div>
        {staff.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
          {staff.map(s => <tr key={s.id}><td><b>{s.name}</b><div className="muted">{s.phone||'—'}</div></td><td>{s.role}</td><td><span className={s.active?'pill':'pill red'}>{s.active?'ACTIVE':'DISABLED'}</span></td>
            <td style={{display:'flex',gap:6}}><button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>toggle(s)}><KeyRound size={13}/></button><button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>remove(s)}><Trash2 size={13}/></button></td></tr>)}
        </tbody></table></div> : <div className="empty">No staff added yet.</div>}
      </div>
    </div></>;
}

type DiaryEntry = { id: string; entry_date: string; author: string; tag: string; title: string; note: string; created_at?: string };
const DIARY_TAGS = ['General', 'Finance', 'Maintenance', 'Incident', 'Staff', 'Marketing'] as const;

function Diary({ notify }: { notify: (m: string) => void }) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState<string>('All');
  const [form, setForm] = useState({ author: '', tag: 'General', title: '', note: '' });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); const { data } = await supabase.from('diary_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }); setEntries((data as DiaryEntry[]) ?? []); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const add = async (e: FormEvent) => {
    e.preventDefault(); if (!form.title.trim()) { notify('Add a title first.'); return; }
    setSaving(true);
    const { error } = await supabase.from('diary_entries').insert({ author: form.author || 'Staff', tag: form.tag, title: form.title, note: form.note });
    setSaving(false);
    if (error) { notify('Could not save entry.'); return; }
    setForm({ author: form.author, tag: 'General', title: '', note: '' }); notify('Diary entry saved.'); void load();
  };
  const remove = async (id: string) => { await supabase.from('diary_entries').delete().eq('id', id); void load(); };
  const shown = filterTag === 'All' ? entries : entries.filter(e => e.tag === filterTag);
  return <>
    <div className="page-head"><div><p className="eyebrow">Daily log</p><h1 className="title">Gym Diary</h1><p className="sub">Every note, incident, decision, and reminder — dated and searchable, in one place.</p></div></div>
    <div className="grid layout-2">
      <div className="card"><div className="card-title">New entry</div>
        <form onSubmit={add} className="form-grid">
          <div className="field"><label>Your name</label><input value={form.author} onChange={e=>setForm(f=>({...f,author:e.target.value}))} placeholder="e.g. Ramesh (Front Desk)" /></div>
          <div className="field"><label>Category</label><select value={form.tag} onChange={e=>setForm(f=>({...f,tag:e.target.value}))}>{DIARY_TAGS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Title</label><input required value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. AC repaired in weight room" /></div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Notes</label><textarea rows={4} value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Details, follow-ups, amounts, names..." /></div>
          <button className="button primary full" disabled={saving} style={{gridColumn:'1 / -1'}}><FileText size={15}/> {saving?'Saving...':'Add to diary'}</button>
        </form>
      </div>
      <div className="card">
        <div className="card-title">Entries <span>{shown.length} shown</span></div>
        <div className="field" style={{marginBottom:14}}><select value={filterTag} onChange={e=>setFilterTag(e.target.value)}><option>All</option>{DIARY_TAGS.map(t=><option key={t}>{t}</option>)}</select></div>
        {loading ? <div className="empty">Loading...</div> : shown.length ? <div className="activity">{shown.map(e => <div className="activity-item" key={e.id}><div className="activity-icon"><FileText size={15}/></div><div className="activity-copy" style={{flex:1}}><b>{e.title}</b> <span className="pill" style={{marginLeft:6}}>{e.tag}</span><br/>{e.note && <span style={{color:'#8b9bb0'}}>{e.note}</span>}<small>{e.entry_date} · {e.author}</small></div><button className="button ghost" style={{padding:'6px 8px',height:'fit-content'}} onClick={()=>remove(e.id)}><Trash2 size={13}/></button></div>)}</div> : <div className="empty">No entries yet.</div>}
      </div>
    </div>
  </>;
}

function FinancePlanner({ billing, expenses, members }: { billing: Billing[]; expenses: { id: number; expense_name: string | null; amount: number | null; expense_date: string | null }[]; members: Member[] }) {
  const revenue = billing.reduce((s, x) => s + (x.paid ?? 0), 0);
  const outstanding = billing.reduce((s, x) => s + (x.due ?? 0), 0);
  const expenseTotal = expenses.reduce((s, x) => s + (x.amount ?? 0), 0);
  const net = revenue - expenseTotal;
  const activeMembers = members.filter(m => m.expiry_date && daysLeft(m.expiry_date) > 0).length;
  const avgRevenuePerMember = activeMembers > 0 ? revenue / activeMembers : 0;
  const [goalAmount, setGoalAmount] = useState('100000');
  const [months, setMonths] = useState('6');
  const monthlySavingNeeded = (Number(goalAmount) / Math.max(1, Number(months))) || 0;
  const monthsToGoalAtCurrentNet = net > 0 ? (Number(goalAmount) / net).toFixed(1) : '—';
  const [fixedCost, setFixedCost] = useState('40000');
  const [pricePerMember, setPricePerMember] = useState('1500');
  const breakEvenMembers = Math.ceil(Number(fixedCost) / Math.max(1, Number(pricePerMember)));
  return <>
    <div className="page-head"><div><p className="eyebrow">Real numbers, no guesswork</p><h1 className="title">Financial Planner</h1><p className="sub">Built off your live billing and expense records — updates automatically as new invoices and expenses come in.</p></div></div>
    <div className="grid stats">
      <Stat icon={CircleDollarSign} label="Collected revenue" value={money(revenue)} foot="All-time" color="var(--green)" />
      <Stat icon={Clock3} label="Outstanding dues" value={money(outstanding)} foot="Uncollected" color="var(--red)" />
      <Stat icon={Wallet} label="Total expenses" value={money(expenseTotal)} foot="All-time" color="var(--gold)" />
      <Stat icon={BarChart3} label="Net position" value={money(net)} foot={net>=0?'Profitable':'Running at a loss'} color={net>=0?'var(--cyan)':'var(--red)'} />
    </div>
    <div className="grid layout-2" style={{marginTop:24}}>
      <div className="card"><div className="card-title">Savings goal planner</div>
        <div className="form-grid">
          <div className="field"><label>Goal amount (₹)</label><input type="number" value={goalAmount} onChange={e=>setGoalAmount(e.target.value)} /></div>
          <div className="field"><label>Target months</label><input type="number" value={months} onChange={e=>setMonths(e.target.value)} /></div>
        </div>
        <div className="calc-result">{money(monthlySavingNeeded)}<span style={{fontSize:13,color:'#8b9bb0',marginLeft:8}}>/ month needed</span></div>
        <div className="result-label">At your current monthly net, this goal is ~{monthsToGoalAtCurrentNet} months away.</div>
      </div>
      <div className="card"><div className="card-title">Break-even calculator</div>
        <div className="form-grid">
          <div className="field"><label>Monthly fixed costs (₹)</label><input type="number" value={fixedCost} onChange={e=>setFixedCost(e.target.value)} /></div>
          <div className="field"><label>Avg. price per member (₹)</label><input type="number" value={pricePerMember} onChange={e=>setPricePerMember(e.target.value)} /></div>
        </div>
        <div className="calc-result">{breakEvenMembers}<span style={{fontSize:13,color:'#8b9bb0',marginLeft:8}}>members needed</span></div>
        <div className="result-label">To cover fixed costs each month at this price point.</div>
      </div>
      <div className="card"><div className="card-title">Per-member economics</div>
        <div className="calc-result">{money(avgRevenuePerMember)}</div>
        <div className="result-label">Average revenue per active member ({activeMembers} active)</div>
      </div>
      <div className="card"><div className="card-title">Collection health</div>
        <div className="calc-result">{revenue+outstanding>0?Math.round(revenue/(revenue+outstanding)*100):0}%</div>
        <div className="result-label">Of billed amount actually collected — chase the rest via Billing tab</div>
      </div>
    </div>
  </>;
}

const FLYER_TEMPLATES = [
  { id: 'offer', name: 'Membership Offer', bg: '#0d1520', accent: '#e9b949' },
  { id: 'newbatch', name: 'New Batch Open', bg: '#101a12', accent: '#55d98a' },
  { id: 'festival', name: 'Festival Special', bg: '#1a0d12', accent: '#ff5c68' },
  { id: 'announcement', name: 'General Announcement', bg: '#0d1520', accent: '#36d8d3' },
] as const;

function FlyerStudio() {
  const [template, setTemplate] = useState<typeof FLYER_TEMPLATES[number]>(FLYER_TEMPLATES[0]);
  const [headline, setHeadline] = useState('NEW YEAR OFFER');
  const [subline, setSubline] = useState('Flat 20% off on annual membership');
  const [footer, setFooter] = useState('BHAJRANG FITNESS · Call now to book your slot');
  const [canvasKey, setCanvasKey] = useState(0);
  const [logoImg] = useState(() => { const img = new Image(); img.src = '/brand/logo.png'; return img; });
  const [logoLoaded, setLogoLoaded] = useState(false);
  useEffect(() => { if (logoImg.complete) setLogoLoaded(true); else logoImg.onload = () => setLogoLoaded(true); }, [logoImg]);
  const draw = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const W = 1080, H = 1350; canvas.width = W; canvas.height = H;
    ctx.fillStyle = template.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = template.accent; ctx.lineWidth = 6; ctx.strokeRect(30, 30, W - 60, H - 60);
    if (logoLoaded && logoImg.naturalWidth) {
      const targetW = 420; const targetH = targetW * (logoImg.naturalHeight / logoImg.naturalWidth);
      ctx.drawImage(logoImg, (W - targetW) / 2, 55, targetW, targetH);
    } else {
      ctx.fillStyle = template.accent; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('BHAJRANG FITNESS', W / 2, 150);
    }
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 76px sans-serif'; ctx.textAlign = 'center';
    wrapText(ctx, headline.toUpperCase(), W / 2, 520, 900, 84);
    ctx.fillStyle = template.accent; ctx.font = '42px sans-serif';
    wrapText(ctx, subline, W / 2, 720, 850, 54);
    ctx.fillStyle = '#c7d2e0'; ctx.font = '30px sans-serif';
    ctx.fillText(footer, W / 2, H - 90);
  }, [template, headline, subline, footer, logoLoaded, logoImg]);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => draw(node), [draw]);
  const download = () => { const canvas = document.getElementById('flyer-canvas') as HTMLCanvasElement | null; if (!canvas) return; const link = document.createElement('a'); link.download = `flyer-${template.id}.png`; link.href = canvas.toDataURL('image/png'); link.click(); };
  return <>
    <div className="page-head"><div><p className="eyebrow">Zero-cost design</p><h1 className="title">Flyer Studio</h1><p className="sub">Generate posters entirely in the browser — no API, no subscription. Download as PNG and post anywhere.</p></div></div>
    <div className="grid layout-2">
      <div className="card">
        <div className="card-title">Design</div>
        <div className="form-grid">
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Template</label><select value={template.id} onChange={e=>{setTemplate(FLYER_TEMPLATES.find(t=>t.id===e.target.value)!);setCanvasKey(k=>k+1)}}>{FLYER_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Headline</label><input value={headline} onChange={e=>setHeadline(e.target.value)} /></div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Subline</label><input value={subline} onChange={e=>setSubline(e.target.value)} /></div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Footer / contact</label><input value={footer} onChange={e=>setFooter(e.target.value)} /></div>
        </div>
        <button className="button primary full" style={{marginTop:16}} onClick={download}><Download size={15}/> Download PNG</button>
        <p className="muted" style={{fontSize:11,marginTop:12,lineHeight:1.6}}>Your Bhajrang Fitness logo is now applied automatically on every template.</p>
      </div>
      <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
        <canvas key={canvasKey} id="flyer-canvas" ref={canvasRef} style={{width:'100%',maxWidth:360,borderRadius:12,boxShadow:'0 8px 30px rgba(0,0,0,.4)'}} />
      </div>
    </div>
  </>;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' '); let line = ''; let curY = y;
  for (const word of words) { const test = line + word + ' '; if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line.trim(), x, curY); line = word + ' '; curY += lineHeight; } else line = test; }
  ctx.fillText(line.trim(), x, curY);
}

function isBirthdaySoon(dob: string | null, withinDays: number): boolean {
  if (!dob) return false;
  const d = new Date(dob); if (isNaN(d.getTime())) return false;
  const today = new Date(); const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next.setFullYear(today.getFullYear() + 1);
  const diff = Math.ceil((next.getTime() - today.getTime()) / 86400000);
  return diff >= 0 && diff <= withinDays;
}

function ManualAttendance({ members, attendance, notify, onRefresh }: { members: Member[]; attendance: AttendanceLog[]; notify: (m: string) => void; onRefresh: () => void }) {
  const [q, setQ] = useState('');
  const filtered = q ? members.filter(m => (m.name || '').toLowerCase().includes(q.toLowerCase()) || m.member_id.toLowerCase().includes(q.toLowerCase()) || m.phone.includes(q)) : [];
  const today = new Date().toDateString();
  const todays = attendance.filter(x => x.punch_in_time && new Date(x.punch_in_time).toDateString() === today);
  const mark = async (m: Member) => {
    const existing = todays.find(x => x.member_id === m.member_id && !x.punch_out_time);
    if (existing) { await supabase.from('attendance_logs').update({ punch_out_time: new Date().toISOString(), status: 'CHECKED_OUT' }).eq('id', existing.id); notify(`${m.name || m.member_id} checked out.`); }
    else { await supabase.from('attendance_logs').insert({ member_id: m.member_id, status: 'CHECKED_IN' }); notify(`${m.name || m.member_id} marked present.`); }
    onRefresh();
  };
  return <><div className="page-head"><div><p className="eyebrow">Reception</p><h1 className="title">Manual Attendance</h1><p className="sub">For members who arrive without their QR pass or kiosk access — mark them in by hand.</p></div></div>
    <div className="card"><div style={{position:'relative',marginBottom:16}}><Search size={14} color="#728297" style={{position:'absolute',left:12,top:12}}/><input className="search" style={{paddingLeft:34,width:'100%'}} placeholder="Search by name, ID, or phone" value={q} onChange={e=>setQ(e.target.value)}/></div>
      {q && (filtered.length ? <div className="activity">{filtered.map(m => { const inToday = todays.find(x=>x.member_id===m.member_id&&!x.punch_out_time); return <div className="activity-item" key={m.member_id}><div className="activity-icon"><Users size={15}/></div><div className="activity-copy"><b>{m.name||m.member_id}</b><small>{m.member_id} · {m.phone}</small></div><button className={inToday?'button ghost':'button primary'} onClick={()=>mark(m)}><UserCheck size={14}/> {inToday?'Mark out':'Mark present'}</button></div>; })}</div> : <div className="empty">No matching warriors.</div>)}
    </div>
    <div className="card" style={{marginTop:20}}><div className="card-title">Today's attendance <span>{todays.length} check-ins</span></div>{todays.length?<div className="activity">{todays.slice(0,15).map(x=><div className="activity-item" key={x.id}><div className="activity-icon"><UserCheck size={15}/></div><div className="activity-copy"><b>{x.member_id}</b><small>{x.punch_in_time?new Date(x.punch_in_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''}</small></div><span className={x.punch_out_time?'pill':'pill gold'} style={{marginLeft:'auto'}}>{x.punch_out_time?'OUT':'IN'}</span></div>)}</div>:<div className="empty">No check-ins yet today.</div>}</div>
  </>;
}

function pingTelegram(message: string) { void supabase.functions.invoke('notify-telegram', { body: { message } }).catch(() => {}); }
function sendCloudEmail(to: string, toName: string, subject: string, text: string) { if (!to) return; void supabase.functions.invoke('send-email', { body: { to, toName, subject, text } }).catch(() => {}); }

function JoinMember({ passcode, notify, onRefresh }: { passcode: string; notify: (m: string) => void; onRefresh: () => void }) {
  const { packages, loading: packagesLoading } = usePackages();
  const [form, setForm] = useState({ name: '', phone: '', dob: '', gender: 'Male', package: '', amount: '', months: '1' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ memberId: string; passcode: string } | null>(null);
  useEffect(() => { if (!form.package && packages.length) { const p = packages[0]; setForm(f => ({ ...f, package: p.name, amount: String(p.price), months: String(p.duration_months) })); } }, [packages, form.package]);
  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const pickPackage = (name: string) => { const p = packages.find(x => x.name === name); setForm(f => ({ ...f, package: name, amount: p ? String(p.price) : f.amount, months: p ? String(p.duration_months) : f.months })); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { data, error } = await supabase.rpc('walkin_join_member', {
      p_passcode: passcode, p_name: form.name, p_phone: form.phone, p_dob: form.dob || '', p_gender: form.gender,
      p_package: form.package, p_amount: Number(form.amount), p_months: Number(form.months || 1),
    });
    setSaving(false);
    if (error || !data) { notify('Could not create member. Check the phone/ID fields.'); return; }
    const memberId = (data as { member_id: string; passcode: string }).member_id;
    const memberPasscode = (data as { member_id: string; passcode: string }).passcode;
    setCreated({ memberId, passcode: memberPasscode }); notify(`${form.name} joined RBF.`); pingTelegram(`🆕 New member joined: ${form.name} (${memberId}) — ${form.package} package.`); onRefresh();
    const p0 = packages[0]; setForm({ name: '', phone: '', dob: '', gender: 'Male', package: p0?.name || '', amount: p0 ? String(p0.price) : '', months: p0 ? String(p0.duration_months) : '1' });
  };
  return <><div className="page-head"><div><p className="eyebrow">Reception</p><h1 className="title">New Member / Walk-in Join</h1><p className="sub">For someone joining in person right now — creates their Warrior ID and vault instantly.</p></div></div>
    <div className="grid layout-2">
      <div className="card"><div className="card-title">Member details</div>
        <form onSubmit={submit} className="form-grid">
          <div className="field"><label>Full name</label><input required value={form.name} onChange={update('name')} /></div>
          <div className="field"><label>Phone</label><input required value={form.phone} onChange={update('phone')} /></div>
          <div className="field"><label>Date of birth</label><input type="date" value={form.dob} onChange={update('dob')} /></div>
          <div className="field"><label>Gender</label><select value={form.gender} onChange={update('gender')}><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div className="field"><label>Package</label><select value={form.package} onChange={e=>pickPackage(e.target.value)} disabled={packagesLoading}>{packages.map(p=><option key={p.id} value={p.name}>{p.name} — {money(p.price)}</option>)}</select></div>
          <div className="field"><label>Duration (months)</label><input type="number" value={form.months} onChange={update('months')} /></div>
          <div className="field"><label>Amount paid (₹)</label><input type="number" value={form.amount} onChange={update('amount')} /></div>
          <button className="button primary full" disabled={saving||!form.package} style={{gridColumn:'1 / -1'}}><UserPlus size={15}/> {saving?'Creating vault...':'Join & create Warrior ID'}</button>
        </form>
      </div>
      <div className="card">{created ? <><div className="card-title">Welcome kit <span>Give this to the member</span></div><div style={{textAlign:'center',padding:'20px 0'}}><QRCodeSVG value={created.memberId} size={160}/></div><div style={{display:'flex',justifyContent:'space-between',fontSize:14,marginTop:10}}><span className="muted">Warrior ID</span><b>{created.memberId}</b></div><div style={{display:'flex',justifyContent:'space-between',fontSize:14,marginTop:6}}><span className="muted">Passcode</span><b>{created.passcode}</b></div><p className="sub" style={{marginTop:16}}>They can log in at <code>/warrior</code> with these details.</p></> : <div className="empty"><UserPlus size={24} style={{marginBottom:10}}/><br/>New member's ID and QR pass will appear here after joining.</div>}</div>
    </div>
  </>;
}

function Reminders({ members, billing, notify }: { members: Member[]; billing: Billing[]; notify: (m: string) => void }) {
  const renewals = members.filter(m => { const d = daysLeft(m.expiry_date); return d > 0 && d <= 14; }).sort((a, b) => daysLeft(a.expiry_date) - daysLeft(b.expiry_date));
  const birthdays = members.filter(m => isBirthdaySoon(m.dob, 7));
  const dues = billing.filter(x => (x.due ?? 0) > 0);
  const dueName = (id: string | null) => members.find(m => m.member_id === id)?.name || id || 'Member';
  const duePhone = (id: string | null) => members.find(m => m.member_id === id)?.phone || '';
  const waLink = (phone: string, text: string) => { const digits = phone.replace(/\D/g, ''); const withCountry = digits.length === 10 ? `91${digits}` : digits; return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`; };
  const smsLink = (phone: string, text: string) => `sms:${phone.replace(/\D/g, '')}?body=${encodeURIComponent(text)}`;
  const mailLink = (email: string, subject: string, text: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  const dueEmail = (id: string | null) => members.find(m => m.member_id === id)?.email || '';
  const copy = (text: string, label: string) => { navigator.clipboard?.writeText(text); notify(`${label} copied — paste it anywhere.`); };
  const sendCloud = async (kind: 'renewal' | 'birthday' | 'due', phone: string, params: string[]) => {
    if (!phone) return;
    try {
      const { data } = await supabase.functions.invoke('send-whatsapp', { body: { to: phone, kind, params } });
      if (data?.configured === false) { notify('WhatsApp Cloud API not set up yet — use the green button for a manual send instead.'); return; }
      if (data?.ok) { notify('Sent automatically via WhatsApp Cloud API.'); return; }
      notify('WhatsApp Cloud API rejected the send — check the template is approved in Meta Business.');
    } catch { notify('Could not reach the WhatsApp send function.'); }
  };
  return <><div className="page-head"><div><p className="eyebrow">Reception follow-ups</p><h1 className="title">Due & Birthday Reminders</h1><p className="sub">WhatsApp, SMS (your own SIM balance), and email — all one-tap, all free, no messaging subscription.</p></div></div>
    <div className="grid layout-2">
      <div className="card"><div className="card-title">Renewals due soon <span>{renewals.length}</span></div>
        {renewals.length ? <div className="activity">{renewals.map(m => { const msg=`Hi ${m.name||'there'}, your Bhajrang Fitness membership expires on ${m.expiry_date}. Renew soon to keep your streak going! 💪`; return <div className="activity-item" key={m.member_id}><div className="activity-icon"><Clock3 size={15}/></div><div className="activity-copy"><b>{m.name||m.member_id}</b><small>{m.phone} · expires in {daysLeft(m.expiry_date)}d ({m.expiry_date})</small></div><div style={{display:'flex',gap:6}}>{m.phone&&<a className="button cyan" style={{padding:'6px 8px'}} title="WhatsApp" href={waLink(m.phone,msg)} target="_blank" rel="noreferrer"><Smartphone size={13}/></a>}{m.phone&&<a className="button ghost" style={{padding:'6px 8px'}} title="SMS (your SIM)" href={smsLink(m.phone,msg)}><MessageSquare size={13}/></a>}{m.email&&<a className="button ghost" style={{padding:'6px 8px'}} title="Email" href={mailLink(m.email,'Membership renewal — Bhajrang Fitness',msg)}><Mail size={13}/></a>}{m.phone&&<button className="button ghost" style={{padding:'6px 8px'}} title="Send automatically via WhatsApp Cloud API" onClick={()=>sendCloud('renewal',m.phone,[m.name||'there',m.expiry_date||''])}><Bell size={13}/></button>}<button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>copy(msg,'Renewal message')}><FileText size={13}/></button></div></div>; })}</div> : <div className="empty">No renewals due in the next two weeks.</div>}
      </div>
      <div className="card"><div className="card-title">Birthdays this week <span>{birthdays.length}</span></div>
        {birthdays.length ? <div className="activity">{birthdays.map(m => { const msg=`Happy Birthday ${m.name||''}! 🎉 Team Bhajrang Fitness wishes you a strong and healthy year ahead. See you at the gym!`; return <div className="activity-item" key={m.member_id}><div className="activity-icon"><Sparkles size={15}/></div><div className="activity-copy"><b>{m.name||m.member_id}</b><small>{m.phone}</small></div><div style={{display:'flex',gap:6}}>{m.phone&&<a className="button cyan" style={{padding:'6px 8px'}} title="WhatsApp" href={waLink(m.phone,msg)} target="_blank" rel="noreferrer"><Smartphone size={13}/></a>}{m.phone&&<a className="button ghost" style={{padding:'6px 8px'}} title="SMS (your SIM)" href={smsLink(m.phone,msg)}><MessageSquare size={13}/></a>}{m.email&&<a className="button ghost" style={{padding:'6px 8px'}} title="Email" href={mailLink(m.email,'Happy Birthday from Bhajrang Fitness!',msg)}><Mail size={13}/></a>}{m.phone&&<button className="button ghost" style={{padding:'6px 8px'}} title="Send automatically via WhatsApp Cloud API" onClick={()=>sendCloud('birthday',m.phone,[m.name||'there'])}><Bell size={13}/></button>}<button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>copy(msg,'Birthday message')}><FileText size={13}/></button></div></div>; })}</div> : <div className="empty">No birthdays in the next 7 days.</div>}
      </div>
      <div className="card" style={{gridColumn:'1 / -1'}}><div className="card-title">Payment follow-ups <span>{dues.length}</span></div>
        {dues.length ? <div className="activity">{dues.map(x => { const phone=duePhone(x.member_id); const email=dueEmail(x.member_id); const msg=`Hi ${dueName(x.member_id)}, a friendly reminder that ${money(x.due)} is pending on your Bhajrang Fitness account. Please clear it at your convenience. Thank you!`; return <div className="activity-item" key={x.id}><div className="activity-icon"><CircleDollarSign size={15}/></div><div className="activity-copy"><b>{dueName(x.member_id)}</b><small>{money(x.due)} outstanding</small></div><div style={{display:'flex',gap:6}}>{phone&&<a className="button cyan" style={{padding:'6px 8px'}} title="WhatsApp" href={waLink(phone,msg)} target="_blank" rel="noreferrer"><Smartphone size={13}/></a>}{phone&&<a className="button ghost" style={{padding:'6px 8px'}} title="SMS (your SIM)" href={smsLink(phone,msg)}><MessageSquare size={13}/></a>}{email&&<a className="button ghost" style={{padding:'6px 8px'}} title="Email" href={mailLink(email,'Payment due — Bhajrang Fitness',msg)}><Mail size={13}/></a>}{phone&&<button className="button ghost" style={{padding:'6px 8px'}} title="Send automatically via WhatsApp Cloud API" onClick={()=>sendCloud('due',phone,[dueName(x.member_id),money(x.due)])}><Bell size={13}/></button>}<button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>copy(msg,'Due reminder')}><FileText size={13}/></button></div></div>; })}</div> : <div className="empty">No outstanding dues.</div>}
      </div>
    </div>
  </>;
}

function StoreInventory({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ item_name: '', category: 'Supplement', quantity: '0', reorder_level: '5', unit_price: '0' });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); const { data } = await supabase.from('inventory').select('*').order('item_name', { ascending: true }); setItems((data as Inventory[]) ?? []); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const add = async (e: FormEvent) => {
    e.preventDefault(); if (!form.item_name.trim()) { notify('Add an item name first.'); return; }
    setSaving(true);
    const { error } = await supabase.from('inventory').insert({ item_name: form.item_name, category: form.category, quantity: Number(form.quantity), reorder_level: Number(form.reorder_level), unit_price: Number(form.unit_price), last_restocked: new Date().toISOString().slice(0, 10) });
    setSaving(false);
    if (error) { notify('Could not add item.'); return; }
    setForm({ item_name: '', category: form.category, quantity: '0', reorder_level: '5', unit_price: '0' }); notify(`${form.item_name} added to inventory.`); void load();
  };
  const adjust = async (item: Inventory, delta: number) => { const next = Math.max(0, item.quantity + delta); await supabase.from('inventory').update({ quantity: next }).eq('id', item.id); void load(); };
  const remove = async (item: Inventory) => { await supabase.from('inventory').delete().eq('id', item.id); notify(`${item.item_name} removed.`); void load(); };
  const lowStock = items.filter(i => i.quantity <= i.reorder_level);
  return <>
    <div className="page-head"><div><p className="eyebrow">Gym store</p><h1 className="title">Inventory Tracking</h1><p className="sub">Supplements, gear, and accessories — stock levels update instantly.</p></div></div>
    <div className="grid stats">
      <Stat icon={Dumbbell} label="Items tracked" value={items.length} foot="Distinct products" color="var(--cyan)" />
      <Stat icon={Bell} label="Low stock" value={lowStock.length} foot="At or below reorder level" color="var(--red)" />
      <Stat icon={Wallet} label="Units on hand" value={items.reduce((s, i) => s + i.quantity, 0)} foot="Total quantity" color="var(--gold)" />
    </div>
    <div className="grid layout-2" style={{marginTop:20}}>
      <div className="card"><div className="card-title">Add item</div>
        <form onSubmit={add} className="form-grid">
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Item name</label><input required value={form.item_name} onChange={e=>setForm(f=>({...f,item_name:e.target.value}))} placeholder="e.g. Whey Protein 1kg" /></div>
          <div className="field"><label>Category</label><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}><option>Supplement</option><option>Apparel</option><option>Equipment</option><option>Accessory</option><option>Beverage</option></select></div>
          <div className="field"><label>Unit price (₹)</label><input type="number" value={form.unit_price} onChange={e=>setForm(f=>({...f,unit_price:e.target.value}))} /></div>
          <div className="field"><label>Starting quantity</label><input type="number" value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))} /></div>
          <div className="field"><label>Reorder level</label><input type="number" value={form.reorder_level} onChange={e=>setForm(f=>({...f,reorder_level:e.target.value}))} /></div>
          <button className="button primary full" disabled={saving} style={{gridColumn:'1 / -1'}}><Dumbbell size={15}/> {saving?'Saving...':'Add to inventory'}</button>
        </form>
      </div>
      <div className="card"><div className="card-title">Stock <span>{items.length} items</span></div>
        {loading ? <div className="empty">Loading...</div> : items.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Price</th><th></th></tr></thead><tbody>{items.map(i => <tr key={i.id}><td><b>{i.item_name}</b>{i.quantity<=i.reorder_level&&<div className="muted" style={{color:'var(--red)'}}>Low stock</div>}</td><td>{i.category}</td><td>{i.quantity}</td><td>{money(i.unit_price)}</td><td style={{display:'flex',gap:4}}><button className="button ghost" style={{padding:'5px 8px'}} onClick={()=>adjust(i,-1)}>−</button><button className="button ghost" style={{padding:'5px 8px'}} onClick={()=>adjust(i,1)}>+</button><button className="button ghost" style={{padding:'5px 8px'}} onClick={()=>remove(i)}><Trash2 size={13}/></button></td></tr>)}</tbody></table></div> : <div className="empty">No inventory yet.</div>}
      </div>
    </div>
  </>;
}

async function compressImageFile(file: File, maxDim = 640, quality = 0.72): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Compression failed.')), 'image/jpeg', quality));
}
async function uploadCompressedPhoto(bucket: string, file: File): Promise<string> {
  const blob = await compressImageFile(file);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
function PhotoUploadField({ label, hint, value, onChange, capture }: { label: string; hint: string; value: string | null; onChange: (url: string, kb: number) => void; capture?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [kb, setKb] = useState<number | null>(null);
  const handle = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError('');
    try {
      const blob = await compressImageFile(file);
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
      const { error: err } = await supabase.storage.from('member-selfies').upload(path, blob, { contentType: 'image/jpeg' });
      if (err) throw err;
      const { data } = supabase.storage.from('member-selfies').getPublicUrl(path);
      setKb(Math.round(blob.size / 1024)); onChange(data.publicUrl, Math.round(blob.size / 1024));
    } catch { setError('Could not upload that photo. Try again.'); }
    setBusy(false); e.target.value = '';
  };
  return <div className="field" style={{ gridColumn: '1 / -1' }}>
    <label>{label}</label>
    {value ? <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src={value} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} /><span className="muted" style={{ fontSize: 12 }}>Uploaded{kb ? ` — ${kb}KB` : ''}. <label style={{ color: 'var(--cyan)', cursor: 'pointer' }}>Retake<input type="file" accept="image/*" capture={capture ? 'user' : undefined} onChange={handle} style={{ display: 'none' }} /></label></span></div>
      : <label className="button ghost" style={{ cursor: 'pointer', width: 'fit-content' }}><Smartphone size={15} /> {busy ? 'Uploading...' : 'Take / choose photo'}<input type="file" accept="image/*" capture={capture ? 'user' : undefined} onChange={handle} style={{ display: 'none' }} /></label>}
    <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>{hint}</p>
    {error && <p className="error" style={{ fontSize: 12 }}>{error}</p>}
  </div>;
}
function PublicSignup() {
  const [form, setForm] = useState({
    name: '', mobile: '', whatsapp: '', email: '', dob: '', gender: 'Male', bloodGroup: '', maritalStatus: '',
    fatherName: '', govtId: '', occupation: '', gymExperience: '',
    address: '', city: '', state: '', pin: '',
    heightCm: '', weightKg: '', medicalConditions: '', goal: '',
    consent: false,
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(x => ({ ...x, [key]: e.target.value }));
  const bmi = form.heightCm && form.weightKg ? (Number(form.weightKg) / ((Number(form.heightCm) / 100) ** 2)) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    if (!photoUrl) { setErrorMsg('A selfie photo is required to complete your application.'); return; }
    if (!form.consent) { setErrorMsg('Please confirm the health information consent to continue.'); return; }
    setSaving(true);
    const { error } = await supabase.from('pending_approvals').insert({
      name: form.name, mobile: form.mobile, whatsapp: form.whatsapp || form.mobile, email: form.email, dob: form.dob,
      gender: form.gender, blood_group: form.bloodGroup, marital_status: form.maritalStatus,
      father_name: form.fatherName, govt_id: form.govtId, occupation: form.occupation, gym_experience_years: form.gymExperience,
      address: form.address, city: form.city, state: form.state, pin: form.pin,
      height_cm: form.heightCm ? Number(form.heightCm) : null, weight_kg: form.weightKg ? Number(form.weightKg) : null,
      medical_conditions: form.medicalConditions, goal: form.goal, health_consent: form.consent, status: 'PENDING',
      photo_base64: photoUrl,
    });
    setSaving(false);
    if (error) { setErrorMsg('Something went wrong submitting your application. Please try again.'); return; }
    pingTelegram(`📝 New application: ${form.name} (${form.mobile}) — awaiting review.`);
    setDone(true);
  };
  if (done) return <main className="portal-login"><div className="card" style={{maxWidth:420,margin:'12vh auto',textAlign:'center'}}>
    <CheckCircle2 size={44} color="var(--green)" style={{margin:'0 auto 16px'}} />
    <h1 className="title">Application received!</h1>
    <p className="sub">Bhajrang Fitness will review your application and reach out to activate your Warrior ID. Once approved, log in at <code>/warrior</code>.</p>
  </div></main>;
  return <main className="portal-login"><div className="card" style={{maxWidth:560,margin:'4vh auto'}}>
    <Brand />
    <p className="eyebrow" style={{marginTop:20}}>Join Bhajrang Fitness</p>
    <h1 className="title">Start your membership.</h1>
    <p className="sub">No account needed — fill this out and our team will set up your Warrior ID.</p>
    <form onSubmit={submit} style={{marginTop:22}}>
      <div className="card-title" style={{margin:'0 0 10px'}}>Personal details</div>
      <div className="form-grid">
        <div className="field" style={{gridColumn:'1 / -1'}}><label>Full name</label><input required value={form.name} onChange={update('name')} placeholder="Your name" /></div>
        <div className="field"><label>Father's / Guardian's name</label><input value={form.fatherName} onChange={update('fatherName')} /></div>
        <div className="field"><label>Date of birth</label><input required type="date" value={form.dob} onChange={update('dob')} /></div>
        <div className="field"><label>Gender</label><select value={form.gender} onChange={update('gender')}><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div className="field"><label>Marital status</label><select value={form.maritalStatus} onChange={update('maritalStatus')}><option value="">Prefer not to say</option><option>Single</option><option>Married</option><option>Other</option></select></div>
        <div className="field"><label>Mobile</label><input required value={form.mobile} onChange={update('mobile')} placeholder="10-digit number" /></div>
        <div className="field"><label>WhatsApp (if different)</label><input value={form.whatsapp} onChange={update('whatsapp')} placeholder="Same as mobile if blank" /></div>
        <div className="field" style={{gridColumn:'1 / -1'}}><label>Email (optional)</label><input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" /></div>
      </div>
      <div className="card-title" style={{margin:'22px 0 10px'}}>Identification</div>
      <div className="form-grid">
        <div className="field"><label>Govt. ID number (Aadhaar/PAN/etc.)</label><input value={form.govtId} onChange={update('govtId')} placeholder="For membership verification" /></div>
        <div className="field"><label>Occupation / working details</label><input value={form.occupation} onChange={update('occupation')} placeholder="e.g. Software Engineer, Student" /></div>
        <div className="field" style={{gridColumn:'1 / -1'}}><label>Address</label><input value={form.address} onChange={update('address')} /></div>
        <div className="field"><label>City</label><input value={form.city} onChange={update('city')} /></div>
        <div className="field"><label>State</label><input value={form.state} onChange={update('state')} /></div>
        <div className="field"><label>PIN code</label><input value={form.pin} onChange={update('pin')} /></div>
      </div>
      <div className="card-title" style={{margin:'22px 0 10px'}}>Health & body parameters</div>
      <p className="muted" style={{fontSize:11,marginTop:-6,marginBottom:10}}>This helps our trainers build a safe, personalized program for you.</p>
      <div className="form-grid">
        <div className="field"><label>Height (cm)</label><input type="number" value={form.heightCm} onChange={update('heightCm')} placeholder="e.g. 170" /></div>
        <div className="field"><label>Weight (kg)</label><input type="number" value={form.weightKg} onChange={update('weightKg')} placeholder="e.g. 70" /></div>
        <div className="field"><label>Blood group</label><select value={form.bloodGroup} onChange={update('bloodGroup')}><option value="">Select</option>{['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b=><option key={b}>{b}</option>)}</select></div>
        <div className="field"><label>Prior gym experience (years)</label><input value={form.gymExperience} onChange={update('gymExperience')} placeholder="e.g. 2" /></div>
        {bmi && <div className="field" style={{gridColumn:'1 / -1'}}><label>Estimated BMI</label><div className="calc-result" style={{fontSize:22}}>{bmi.toFixed(1)}</div></div>}
        <div className="field full" style={{gridColumn:'1 / -1'}}><label>Any medical conditions, injuries, or issues we should know about?</label><textarea rows={3} value={form.medicalConditions} onChange={update('medicalConditions')} placeholder="e.g. lower back pain, asthma, high BP, recent surgery — or write 'None'" /></div>
        <div className="field full" style={{gridColumn:'1 / -1'}}><label>Primary fitness goal</label><select required value={form.goal} onChange={update('goal')}><option value="">Choose a goal</option><option>Build muscle</option><option>Lose fat</option><option>Improve strength</option><option>General fitness</option><option>Rehabilitation / recovery</option></select></div>
      </div>
      <div className="card-title" style={{margin:'22px 0 10px'}}>Identity photo</div>
      <div className="form-grid">
        <PhotoUploadField label="Selfie (required)" hint="Used for your Warrior ID card and reception verification. Compressed automatically, uses very little storage." value={photoUrl} onChange={setPhotoUrl} capture />
      </div>
      <label style={{display:'flex',gap:8,alignItems:'flex-start',marginTop:18,fontSize:12,color:'#a8b4c4',lineHeight:1.5}}>
        <input type="checkbox" checked={form.consent} onChange={e=>setForm(f=>({...f,consent:e.target.checked}))} style={{marginTop:3}} />
        I consent to Bhajrang Fitness collecting and storing this health and personal information to build my training program and for gym records.
      </label>
      {errorMsg && <p className="error" style={{fontSize:12,marginTop:10}}>{errorMsg}</p>}
      <button className="button primary full" disabled={saving} style={{width:'100%',justifyContent:'center',marginTop:18}}><UserPlus size={15}/> {saving?'Submitting...':'Submit application'}</button>
    </form>
    <p className="muted" style={{fontSize:11,marginTop:16,textAlign:'center'}}>Already a member? <a href="/warrior" style={{color:'var(--cyan)'}}>Log in to your Warrior portal</a></p>
  </div></main>;
}

function upiLink(vpa: string, name: string, amount: number, note: string) {
  return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
}

function UpiQrButton({ vpa, amount, note }: { vpa: string; amount: number; note: string }) {
  const [open, setOpen] = useState(false);
  if (!vpa) return null;
  return <div style={{position:'relative',display:'inline-block'}}>
    <button type="button" className="button ghost" style={{padding:'6px 8px'}} onClick={()=>setOpen(o=>!o)} title="Show UPI QR"><CreditCard size={13}/></button>
    {open && <div className="card" style={{position:'absolute',right:0,top:'110%',zIndex:20,padding:16,textAlign:'center',minWidth:200}}>
      <QRCodeSVG value={upiLink(vpa, 'Bhajrang Fitness', amount, note)} size={150} />
      <p className="muted" style={{fontSize:11,marginTop:8}}>Scan with any UPI app · {money(amount)}</p>
    </div>}
  </div>;
}

function NoticesDesk({ notify }: { notify: (m: string) => void }) {
  const [notices, setNotices] = useState<{ id: string; title: string; body: string; active: boolean; created_at: string }[]>([]);
  const [freezes, setFreezes] = useState<{ id: string; member_id: string; reason: string | null; status: string; requested_at: string }[]>([]);
  const [form, setForm] = useState({ title: '', body: '' });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const [n, f] = await Promise.all([
      supabase.from('notices').select('*').order('created_at', { ascending: false }),
      supabase.from('freeze_requests').select('*').eq('status', 'PENDING').order('requested_at', { ascending: false }),
    ]);
    setNotices(n.data ?? []); setFreezes(f.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const post = async (e: FormEvent) => {
    e.preventDefault(); if (!form.title.trim()) return; setSaving(true);
    await supabase.from('notices').insert({ title: form.title, body: form.body, active: true });
    setSaving(false); setForm({ title: '', body: '' }); notify('Notice posted to the Warrior app.'); void load();
  };
  const toggle = async (n: { id: string; active: boolean }) => { await supabase.from('notices').update({ active: !n.active }).eq('id', n.id); void load(); };
  const resolveFreeze = async (id: string, status: 'APPROVED' | 'DECLINED') => { await supabase.from('freeze_requests').update({ status, resolved_at: new Date().toISOString() }).eq('id', id); notify(`Freeze request ${status.toLowerCase()}.`); void load(); };
  return <>
    <div className="page-head"><div><p className="eyebrow">Communication</p><h1 className="title">Notices & Freeze Requests</h1><p className="sub">Broadcast announcements to every member's app, and review pause requests.</p></div></div>
    <div className="grid layout-2">
      <div className="card"><div className="card-title">Post a notice</div>
        <form onSubmit={post} className="form-grid">
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Title</label><input required value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Closed for Diwali on Nov 1" /></div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Details</label><textarea rows={3} value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} /></div>
          <button className="button primary full" disabled={saving} style={{gridColumn:'1 / -1'}}><Bell size={15}/> {saving?'Posting...':'Post to all members'}</button>
        </form>
        <div style={{marginTop:18}}>{notices.map(n => <div className="activity-item" key={n.id}><div className="activity-icon"><Bell size={15}/></div><div className="activity-copy"><b>{n.title}</b><small>{new Date(n.created_at).toLocaleDateString()}</small></div><button className={n.active?'pill':'pill red'} style={{marginLeft:'auto',cursor:'pointer',border:'none'}} onClick={()=>toggle(n)}>{n.active?'LIVE':'HIDDEN'}</button></div>)}</div>
      </div>
      <div className="card"><div className="card-title">Freeze requests <span>{freezes.length} pending</span></div>
        {freezes.length ? <div className="activity">{freezes.map(f => <div className="activity-item" key={f.id}><div className="activity-icon"><Clock3 size={15}/></div><div className="activity-copy"><b>{f.member_id}</b><small>{f.reason||'No reason given'}</small></div><div style={{display:'flex',gap:6}}><button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>resolveFreeze(f.id,'APPROVED')}><Check size={13}/></button><button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>resolveFreeze(f.id,'DECLINED')}><X size={13}/></button></div></div>)}</div> : <div className="empty">No pending freeze requests.</div>}
      </div>
    </div>
  </>;
}

function PaymentSettings({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [vpa, setVpa] = useState(''); const [address, setAddress] = useState(''); const [saving, setSaving] = useState(false);
  const [currentPass, setCurrentPass] = useState(''); const [newPass, setNewPass] = useState(''); const [confirmPass, setConfirmPass] = useState(''); const [changing, setChanging] = useState(false);
  const [brochureUrl, setBrochureUrl] = useState(''); const [brochureUploading, setBrochureUploading] = useState(false);
  useEffect(() => { void supabase.from('gym_settings').select('key,value').in('key', ['upi_vpa', 'gym_address', 'brochure_url']).then(({ data }) => { data?.forEach(r => { if (r.key === 'upi_vpa') setVpa(r.value || ''); if (r.key === 'gym_address') setAddress(r.value || ''); if (r.key === 'brochure_url') setBrochureUrl(r.value || ''); }); }); }, []);
  const save = async (e: FormEvent) => { e.preventDefault(); setSaving(true); const { error } = await supabase.rpc('admin_save_settings', { p_passcode: passcode, p_upi_vpa: vpa, p_gym_address: address }); setSaving(false); notify(error ? 'Could not save settings.' : 'Payment settings saved — QR codes on invoices are now live.'); };
  const changePasscode = async (e: FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) { notify('New passcode and confirmation do not match.'); return; }
    setChanging(true);
    const { data, error } = await supabase.rpc('set_owner_passcode', { p_current_passcode: currentPass, p_new_passcode: newPass });
    setChanging(false);
    if (error || data !== true) { notify('Could not change passcode — check your current passcode.'); return; }
    setCurrentPass(''); setNewPass(''); setConfirmPass(''); notify('Owner passcode changed. Use the new one next time you unlock the vault.');
  };
  const uploadBrochure = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setBrochureUploading(true);
    try {
      const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
      const path = `brochure-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('gym-documents').upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('gym-documents').getPublicUrl(path);
      const { error: rpcErr } = await supabase.rpc('admin_set_brochure', { p_passcode: passcode, p_url: data.publicUrl });
      if (rpcErr) throw rpcErr;
      setBrochureUrl(data.publicUrl); notify('Brochure uploaded — now visible to members.');
    } catch { notify('Could not upload the brochure.'); }
    setBrochureUploading(false); e.target.value = '';
  };
  const removeBrochure = async () => { const { error } = await supabase.rpc('admin_set_brochure', { p_passcode: passcode, p_url: '' }); if (!error) { setBrochureUrl(''); notify('Brochure removed.'); } };
  return <><div className="page-head"><div><p className="eyebrow">Owner settings</p><h1 className="title">Payment Settings</h1><p className="sub">Your UPI ID powers free QR-code payments on every invoice — no payment gateway or fees.</p></div></div>
    <div className="grid layout-2">
    <div className="card" style={{maxWidth:480}}><form onSubmit={save} className="form-grid">
      <div className="field" style={{gridColumn:'1 / -1'}}><label>UPI ID (VPA)</label><input value={vpa} onChange={e=>setVpa(e.target.value)} placeholder="yourgym@okaxis" /></div>
      <div className="field" style={{gridColumn:'1 / -1'}}><label>Gym address (for invoices)</label><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Full address" /></div>
      <button className="button primary full" disabled={saving} style={{gridColumn:'1 / -1'}}>{saving?'Saving...':'Save settings'}</button>
    </form></div>
    <div className="card" style={{maxWidth:480}}>
      <div className="card-title">Gym brochure</div>
      <p className="muted" style={{fontSize:12,marginBottom:12}}>Upload your packages/features brochure (PDF or image) — members see a download link in the Warrior app and on the Join page.</p>
      {brochureUrl ? <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><a href={brochureUrl} target="_blank" rel="noreferrer" className="button ghost"><FileText size={14}/> View current brochure</a><button type="button" className="button ghost" onClick={removeBrochure}><Trash2 size={13}/></button></div> : <p className="muted" style={{fontSize:12,marginBottom:12}}>No brochure uploaded yet.</p>}
      <label className="button primary" style={{cursor:'pointer',width:'fit-content'}}>{brochureUploading?'Uploading...':<><FileText size={15}/> {brochureUrl?'Replace brochure':'Upload brochure'}</>}<input type="file" accept="application/pdf,image/*" onChange={uploadBrochure} style={{display:'none'}}/></label>
    </div>
    <div className="card" style={{maxWidth:480}}>
      <div className="card-title">Change owner passcode</div>
      <form onSubmit={changePasscode} className="form-grid">
        <div className="field" style={{gridColumn:'1 / -1'}}><label>Current passcode</label><input type="password" inputMode="numeric" value={currentPass} onChange={e=>setCurrentPass(e.target.value)} required /></div>
        <div className="field"><label>New passcode</label><input type="password" inputMode="numeric" value={newPass} onChange={e=>setNewPass(e.target.value)} required /></div>
        <div className="field"><label>Confirm new passcode</label><input type="password" inputMode="numeric" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} required /></div>
        <button className="button primary full" disabled={changing} style={{gridColumn:'1 / -1'}}><KeyRound size={15}/> {changing?'Changing...':'Change passcode'}</button>
      </form>
    </div>
    </div>
  </>;
}

const EDITABLE_FIELDS = [
  ['name','Full name','text'],['phone','Phone','text'],['whatsapp','WhatsApp','text'],['email','Email','email'],
  ['dob','Date of birth','date'],['gender','Gender','select-gender'],['blood_group','Blood group','select-blood'],
  ['marital_status','Marital status','text'],['father_name',"Father's name",'text'],['govt_id','Govt. ID','text'],
  ['occupation','Occupation','text'],['address','Address','text'],['city','City','text'],['state','State','text'],
  ['pin','PIN code','text'],['gym_experience_years','Gym experience (yrs)','text'],
  ['height_cm','Height (cm)','number'],['weight_kg','Weight (kg)','number'],
  ['goal','Primary goal','text'],['medical_conditions','Medical conditions','textarea'],
] as const;

function FieldInput({ f, label, kind, value, onChange }: { f: string; label: string; kind: string; value: string; onChange: (v: string) => void }) {
  const full = kind === 'textarea' || f === 'address';
  return <div className="field" style={full ? { gridColumn: '1 / -1' } : undefined}>
    <label>{label}</label>
    {kind === 'textarea' ? <textarea rows={2} value={value} onChange={e => onChange(e.target.value)} />
      : kind === 'select-gender' ? <select value={value} onChange={e => onChange(e.target.value)}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select>
      : kind === 'select-blood' ? <select value={value} onChange={e => onChange(e.target.value)}><option value="">—</option>{['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b => <option key={b}>{b}</option>)}</select>
      : <input type={kind} value={value} onChange={e => onChange(e.target.value)} />}
  </div>;
}

function MemberEditModal({ member, passcode, onClose, onSaved }: { member: Member; passcode: string; onClose: () => void; onSaved: () => void }) {
  const rec = member as unknown as Record<string, unknown>;
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    EDITABLE_FIELDS.forEach(([f]) => { init[f] = rec[f] == null ? '' : String(rec[f]); });
    init.package = member.package ?? ''; init.joining_date = member.joining_date ?? ''; init.expiry_date = member.expiry_date ?? '';
    return init;
  });
  const [saving, setSaving] = useState(false);
  const set = (f: string) => (v: string) => setForm(x => ({ ...x, [f]: v }));
  const missing = EDITABLE_FIELDS.filter(([f]) => !form[f]).length;
  const save = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.rpc('admin_update_member', { p_passcode: passcode, p_member_id: member.member_id, p_changes: form });
    setSaving(false);
    if (!error) onSaved();
  };
  return <div className="modal-backdrop"><form className="modal" onSubmit={save} style={{maxWidth:720}}>
    <div className="modal-head"><div><p className="eyebrow">{member.member_id}</p><h2 style={{margin:0}}>{member.name || 'Member'}</h2><p className="sub">{missing > 0 ? `${missing} field${missing===1?'':'s'} still empty — fill what you can.` : 'All details complete.'}</p></div><button type="button" className="close" onClick={onClose}><X/></button></div>
    <div className="card-title" style={{margin:'6px 0 10px'}}>Membership</div>
    <div className="form-grid">
      <div className="field"><label>Package</label><input value={form.package} onChange={e=>set('package')(e.target.value)} /></div>
      <div className="field"><label>Joining date</label><input type="date" value={form.joining_date} onChange={e=>set('joining_date')(e.target.value)} /></div>
      <div className="field"><label>Expiry date</label><input type="date" value={form.expiry_date} onChange={e=>set('expiry_date')(e.target.value)} /></div>
    </div>
    <div className="card-title" style={{margin:'18px 0 10px'}}>Personal & health details</div>
    <div className="form-grid">
      {EDITABLE_FIELDS.map(([f, label, kind]) => <FieldInput key={f} f={f} label={label} kind={kind} value={form[f] ?? ''} onChange={set(f)} />)}
    </div>
    <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Saving...':'Save changes'}</button></div>
  </form></div>;
}

function MemberSelfEdit({ member, onClose, notify }: { member: Member; onClose: () => void; notify: (m: string) => void }) {
  const rec = member as unknown as Record<string, unknown>;
  const SELF_FIELDS = EDITABLE_FIELDS.filter(([f]) => f !== 'govt_id');
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    SELF_FIELDS.forEach(([f]) => { init[f] = rec[f] == null ? '' : String(rec[f]); });
    return init;
  });
  const [pass, setPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (f: string) => (v: string) => setForm(x => ({ ...x, [f]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setSaving(true);
    const changed: Record<string, string> = {};
    SELF_FIELDS.forEach(([f]) => { const orig = rec[f] == null ? '' : String(rec[f]); if (form[f] !== orig) changed[f] = form[f]; });
    if (!Object.keys(changed).length) { setSaving(false); setError('Nothing has been changed yet.'); return; }
    const { error: err } = await supabase.rpc('member_request_profile_change', { p_member_id: member.member_id, p_passcode: pass, p_changes: changed });
    setSaving(false);
    if (err) { setError('Could not submit — check your passcode.'); return; }
    notify('Update sent to reception for approval.'); onClose();
  };
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit} style={{maxWidth:680}}>
    <div className="modal-head"><div><p className="eyebrow">My profile</p><h2 style={{margin:0}}>Update my details</h2><p className="sub">Changes go to reception for approval before they appear on your profile.</p></div><button type="button" className="close" onClick={onClose}><X/></button></div>
    <div className="form-grid">{SELF_FIELDS.map(([f, label, kind]) => <FieldInput key={f} f={f} label={label} kind={kind} value={form[f] ?? ''} onChange={set(f)} />)}</div>
    <div className="field" style={{marginTop:14}}><label>Confirm with your passcode</label><input required type="password" inputMode="numeric" maxLength={4} value={pass} onChange={e=>setPass(e.target.value)} placeholder="4 digits" /></div>
    {error && <p className="error" style={{fontSize:12}}>{error}</p>}
    <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:18}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Sending...':'Send for approval'}</button></div>
  </form></div>;
}

function ChangeRequestsDesk({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [reqs, setReqs] = useState<{ id: string; member_id: string; changes: Record<string, string>; requested_at: string }[]>([]);
  const load = useCallback(async () => { const { data } = await supabase.rpc('admin_list_change_requests', { p_passcode: passcode }); setReqs(data ?? []); }, [passcode]);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (id: string, approve: boolean) => {
    const { error } = await supabase.rpc('admin_resolve_change_request', { p_passcode: passcode, p_request_id: id, p_approve: approve });
    if (error) { notify('Could not process that request.'); return; }
    notify(approve ? 'Changes applied to the member record.' : 'Request declined.'); void load();
  };
  if (!reqs.length) return <div className="card" style={{marginBottom:20}}><div className="card-title">Member update requests <span>None pending</span></div><div className="empty">No members have requested profile changes.</div></div>;
  return <div className="card" style={{marginBottom:20,borderColor:'var(--gold)'}}>
    <div className="card-title">Member update requests <span>{reqs.length} pending</span></div>
    {reqs.map(r => <div key={r.id} style={{borderTop:'1px solid var(--line)',paddingTop:12,marginTop:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
        <div><b>{r.member_id}</b><div className="muted" style={{fontSize:11}}>{new Date(r.requested_at).toLocaleString()}</div>
          <div style={{marginTop:6,fontSize:13}}>{Object.entries(r.changes).map(([k,v]) => <div key={k}><span className="muted">{k}:</span> {String(v) || <i className="muted">(cleared)</i>}</div>)}</div>
        </div>
        <div style={{display:'flex',gap:6}}><button className="button primary" style={{padding:'6px 10px'}} onClick={()=>resolve(r.id,true)}><Check size={13}/></button><button className="button ghost" style={{padding:'6px 10px'}} onClick={()=>resolve(r.id,false)}><X size={13}/></button></div>
      </div>
    </div>)}
  </div>;
}

function MemberVaultAccess({ members, passcode, notify }: { members: Member[]; passcode: string; notify: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const [vault, setVault] = useState<{ passcode: string; mobile: string; join_date: string } | null>(null);
  const [customCode, setCustomCode] = useState('');
  const [busy, setBusy] = useState(false);
  const results = q.length >= 2 ? members.filter(m => (m.name || '').toLowerCase().includes(q.toLowerCase()) || m.member_id.toLowerCase().includes(q.toLowerCase()) || m.phone.includes(q)).slice(0, 8) : [];
  const openMember = async (m: Member) => {
    setSelected(m); setVault(null); setBusy(true);
    const { data } = await supabase.rpc('admin_get_member_vault', { p_passcode: passcode, p_member_id: m.member_id });
    const row = Array.isArray(data) ? data[0] : data;
    setBusy(false);
    if (row) setVault(row);
  };
  const reset = async (custom?: string) => {
    if (!selected) return; setBusy(true);
    const { data, error } = await supabase.rpc('admin_reset_member_passcode', { p_passcode: passcode, p_member_id: selected.member_id, p_new_passcode: custom || null });
    setBusy(false);
    if (error || !data) { notify('Could not reset the passcode.'); return; }
    setVault(v => v ? { ...v, passcode: data as string } : v); setCustomCode('');
    notify(`New passcode for ${selected.name || selected.member_id}: ${data}`);
  };
  return <>
    <div className="page-head"><div><p className="eyebrow">Ghost vault</p><h1 className="title">Member Vault Access</h1><p className="sub">Look up any member's login passcode, or reset it if they've forgotten it or lost access.</p></div></div>
    <div className="grid layout-2">
      <div className="card">
        <div className="card-title">Find a member</div>
        <div style={{position:'relative',marginBottom:14}}><Search size={14} color="#728297" style={{position:'absolute',left:12,top:12}}/><input className="search" style={{paddingLeft:34,width:'100%'}} placeholder="Search by name, ID, or phone" value={q} onChange={e=>setQ(e.target.value)}/></div>
        {results.length ? <div className="activity">{results.map(m => <div key={m.member_id} className="activity-item" style={{cursor:'pointer'}} onClick={()=>openMember(m)}><div className="activity-icon"><Users size={15}/></div><div className="activity-copy"><b>{m.name||m.member_id}</b><small>{m.member_id} · {m.phone}</small></div></div>)}</div> : q.length >= 2 ? <div className="empty">No matches.</div> : null}
      </div>
      <div className="card">
        {!selected ? <div className="empty"><KeyRound size={24} style={{marginBottom:10}}/><br/>Search and select a member to view or reset their vault access.</div> : busy && !vault ? <div className="empty">Loading vault...</div> : <>
          <div className="card-title">{selected.name || selected.member_id} <span>{selected.member_id}</span></div>
          {vault ? <>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--line)'}}><span className="muted">Current passcode</span><b style={{fontSize:20,letterSpacing:'.1em',color:'var(--gold)'}}>{vault.passcode}</b></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--line)'}}><span className="muted">Registered mobile</span><b>{vault.mobile}</b></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',marginBottom:14}}><span className="muted">Vault created</span><b>{vault.join_date}</b></div>
            <button className="button primary full" disabled={busy} style={{width:'100%',justifyContent:'center'}} onClick={()=>reset()}><RefreshCw size={15}/> Generate new random passcode</button>
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <input value={customCode} onChange={e=>setCustomCode(e.target.value)} placeholder="Or set a custom code" style={{flex:1}} />
              <button className="button ghost" disabled={busy||!customCode} onClick={()=>reset(customCode)}>Set</button>
            </div>
            <a className="button ghost full" style={{width:'100%',justifyContent:'center',marginTop:14}} href={`https://wa.me/91${vault.mobile}?text=${encodeURIComponent(`Hi ${selected.name||''}, your Bhajrang Fitness Warrior ID is ${selected.member_id} and your passcode is ${vault.passcode}. Log in at the Warrior app anytime.`)}`} target="_blank" rel="noreferrer"><Smartphone size={15}/> Send ID & passcode via WhatsApp</a>
          </> : <div className="empty">No vault record found for this member.</div>}
        </>}
      </div>
    </div>
  </>;
}

function ProgressPhotos({ memberId, notify }: { memberId: string; notify: (m: string) => void }) {
  const [photos, setPhotos] = useState<{ id: string; photo_url: string; taken_at: string; note: string | null }[]>([]);
  const [uploading, setUploading] = useState(false);
  const load = useCallback(async () => { const { data } = await supabase.from('progress_photos').select('*').eq('member_id', memberId).order('taken_at', { ascending: false }); setPhotos(data ?? []); }, [memberId]);
  useEffect(() => { void load(); }, [load]);
  const handle = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true);
    try {
      const url = await uploadCompressedPhoto('progress-photos', file);
      await supabase.from('progress_photos').insert({ member_id: memberId, photo_url: url });
      notify('Progress photo added.'); void load();
    } catch { notify('Could not upload that photo.'); }
    setUploading(false); e.target.value = '';
  };
  const remove = async (id: string) => { await supabase.from('progress_photos').delete().eq('id', id); void load(); };
  return <div className="card" style={{ marginTop: 20 }}>
    <div className="card-title">My progress photos <span>{photos.length} saved</span></div>
    <label className="button primary" style={{ cursor: 'pointer', width: 'fit-content', marginBottom: 14 }}><Smartphone size={15} /> {uploading ? 'Uploading...' : 'Add a progress photo'}<input type="file" accept="image/*" onChange={handle} style={{ display: 'none' }} /></label>
    {photos.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: 10 }}>
      {photos.map(p => <div key={p.id} style={{ position: 'relative' }}>
        <img src={p.photo_url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} />
        <div className="muted" style={{ fontSize: 10, marginTop: 3, textAlign: 'center' }}>{p.taken_at}</div>
        <button onClick={() => remove(p.id)} style={{ position: 'absolute', top: 4, right: 4, background: '#000a', border: 'none', borderRadius: 6, padding: 3, cursor: 'pointer' }}><X size={12} color="#fff" /></button>
      </div>)}
    </div> : <div className="empty">No progress photos yet — track your transformation over time.</div>}
  </div>;
}

function usePackages() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { const { data } = await supabase.from('packages').select('*').order('duration_months', { ascending: true }); setPackages((data as Package[]) ?? []); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  return { packages, loading, reload: load };
}

function PackageManager({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const { packages, loading, reload } = usePackages();
  const [editing, setEditing] = useState<Package | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', duration_months: '1', price: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const startEdit = (p: Package | 'new') => { setEditing(p); setForm(p === 'new' ? { name: '', duration_months: '1', price: '', description: '' } : { name: p.name, duration_months: String(p.duration_months), price: String(p.price), description: p.description || '' }); };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.rpc('admin_upsert_package', { p_passcode: passcode, p_id: editing === 'new' ? null : (editing as Package).id, p_name: form.name, p_duration_months: Number(form.duration_months), p_price: Number(form.price), p_description: form.description });
    setSaving(false);
    if (error) { notify('Could not save that package.'); return; }
    notify('Package saved.'); setEditing(null); void reload();
  };
  const remove = async (p: Package) => { if (!confirm(`Delete ${p.name}?`)) return; await supabase.rpc('admin_delete_package', { p_passcode: passcode, p_id: p.id }); notify(`${p.name} removed.`); void reload(); };
  const askAI = async () => {
    setAiLoading(true); setAiSuggestion('');
    const summary = packages.map(p => `${p.name}: ₹${p.price} for ${p.duration_months}mo`).join(', ');
    const { data, error } = await supabase.functions.invoke('ai-coach', { body: { prompt: `Current gym membership packages: ${summary}. Suggest pricing tweaks, a new package idea, or a promotional bundle to increase sign-ups and revenue. Keep it to 4-5 concise bullet points, India/INR context.` } });
    setAiLoading(false);
    const result = data as { configured?: boolean; ok?: boolean; text?: string; reason?: string } | null;
    if (error || !result) { setAiSuggestion("Could not reach the AI advisor right now — try again in a moment."); return; }
    if (result.configured === false) { setAiSuggestion("AI suggestions need a Gemini or Groq API key configured in Supabase → Project Settings → Edge Functions → Manage secrets. Once set, this gives real pricing/planning advice."); return; }
    if (result.ok === false || !result.text) { setAiSuggestion("The AI engine didn't respond this time — try again in a moment."); return; }
    setAiSuggestion(result.text);
  };
  return <>
    <div className="page-head"><div><p className="eyebrow">Ghost vault</p><h1 className="title">Packages</h1><p className="sub">These prices are what every invoice, walk-in join, and renewal actually charges — edit here and it applies everywhere.</p></div><button className="button primary" onClick={()=>startEdit('new')}><UserPlus size={15}/> New package</button></div>
    <div className="grid layout-2">
      <div className="card">
        <div className="card-title">Current packages <span>{packages.length}</span></div>
        {loading ? <div className="empty">Loading...</div> : packages.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Duration</th><th>Price</th><th></th></tr></thead><tbody>{packages.map(p => <tr key={p.id}><td><b>{p.name}</b><div className="muted">{p.description}</div></td><td>{p.duration_months}mo</td><td>{money(p.price)}</td><td style={{display:'flex',gap:6}}><button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>startEdit(p)}><Settings size={13}/></button><button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>remove(p)}><Trash2 size={13}/></button></td></tr>)}</tbody></table></div> : <div className="empty">No packages yet.</div>}
        {editing && <form onSubmit={save} className="form-grid" style={{marginTop:18,borderTop:'1px solid var(--line)',paddingTop:16}}>
          <div className="card-title" style={{gridColumn:'1 / -1',margin:0}}>{editing==='new'?'New package':'Edit package'}</div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Name</label><input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div className="field"><label>Duration (months)</label><input required type="number" value={form.duration_months} onChange={e=>setForm(f=>({...f,duration_months:e.target.value}))}/></div>
          <div className="field"><label>Price (₹)</label><input required type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/></div>
          <div className="field" style={{gridColumn:'1 / -1'}}><label>Description</label><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
          <div style={{gridColumn:'1 / -1',display:'flex',gap:10,justifyContent:'flex-end'}}><button type="button" className="button ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Saving...':'Save'}</button></div>
        </form>}
      </div>
      <div className="card">
        <div className="card-title"><Sparkles size={16} color="var(--gold)"/> AI package advisor</div>
        <p className="muted" style={{fontSize:12,marginBottom:12}}>Get suggestions on pricing, bundles, or new package ideas based on what you currently offer.</p>
        <button className="button primary full" style={{width:'100%',justifyContent:'center'}} disabled={aiLoading} onClick={askAI}><Sparkles size={15}/> {aiLoading?'Thinking...':'Suggest improvements'}</button>
        {aiSuggestion && <div className="card" style={{marginTop:14,background:'#0c131e',whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.6}}>{aiSuggestion}</div>}
      </div>
    </div>
  </>;
}

