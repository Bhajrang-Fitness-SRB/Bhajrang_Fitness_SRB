import { useCallback, useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { Activity, ArrowLeft, Flame, ArrowRight, BarChart3, Bell, Calculator, Check, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, CreditCard, Download, Dumbbell, FileText, KeyRound, LayoutDashboard, Lock, LogIn, LogOut, Menu, Radio, RefreshCw, Search, Settings, ShieldAlert, ShieldCheck, Skull, Smartphone, Sparkles, Target, Trash2, UserCheck, UserPlus, Users, Wallet, X, Zap } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, type AttendanceLog, type Billing, type Inventory, type Member, type PendingApproval, type Staff } from './lib/supabase';

type Path = '/' | '/warrior' | '/kiosk' | '/villain' | '/join';
type AdminTab = 'overview' | 'attendance' | 'join' | 'approvals' | 'members' | 'reminders' | 'notices' | 'billing' | 'expenses' | 'inventory' | 'ai' | 'diary' | 'flyers';
const VILLAIN_PASSCODE = '295592';
const VILLAIN_SESSION_KEY = 'rbf_villain_unlocked';

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
  return <div className="app">
    <div className="bg-watermark" />
    {showSplash && <div className={`splash${splashLeaving ? ' leaving' : ''}`}><img src="/brand/splash.jpg" alt="Bhajrang Fitness" /></div>}
    {path === '/' && <Admin onBack={undefined} notify={notify} />}
    {path === '/warrior' && <Portal onBack={home} notify={notify} />}
    {path === '/kiosk' && <Kiosk onBack={home} notify={notify} />}
    {path === '/villain' && <VillainGate onBack={home} notify={notify} />}
    {path === '/join' && <PublicSignup />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function Brand() { return <div className="brand"><img src="/brand/logo.png" alt="Bhajrang Fitness" className="brand-logo" /></div>; }
function Header({ onBack }: { onBack?: () => void }) { return <header className="topbar"><div style={{display:'flex',alignItems:'center',gap:18}}>{onBack && <button className="button ghost" onClick={onBack} style={{padding:'8px 10px'}}><ArrowLeft size={16}/></button>}<Brand /></div><div className="top-actions"><span className="status-dot"><i className="dot"/> SYSTEMS ONLINE</span></div></header>; }


function Admin({ onBack, notify }: { onBack?: () => void; notify: (m: string) => void }) {
 const [tab,setTab]=useState<AdminTab>('overview'); const [members,setMembers]=useState<Member[]>([]); const [pending,setPending]=useState<PendingApproval[]>([]); const [billing,setBilling]=useState<Billing[]>([]); const [attendance,setAttendance]=useState<AttendanceLog[]>([]); const [expenses,setExpenses]=useState<{id:number;expense_name:string|null;amount:number|null;expense_date:string|null}[]>([]); const [loading,setLoading]=useState(true); const [showExpense,setShowExpense]=useState(false);
 const load=useCallback(async()=>{setLoading(true); const [m,p,b,a,e]=await Promise.all([supabase.from('members').select('*').order('created_at',{ascending:false}),supabase.from('pending_approvals').select('*').eq('status','PENDING').order('created_at',{ascending:false}),supabase.from('billing').select('*').order('created_at',{ascending:false}),supabase.from('attendance_logs').select('*').order('punch_in_time',{ascending:false}),supabase.from('expenses').select('*').order('expense_date',{ascending:false})]); if(m.data)setMembers(m.data);if(p.data)setPending(p.data);if(b.data)setBilling(b.data);if(a.data)setAttendance(a.data);if(e.data)setExpenses(e.data);setLoading(false)},[]); useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),10000);return()=>window.clearInterval(timer)},[load]);
 const revenue=billing.reduce((s,x)=>s+(x.paid??0),0), expenseTotal=expenses.reduce((s,x)=>s+(x.amount??0),0), active=members.filter(m=>daysLeft(m.expiry_date)>0).length, present=attendance.filter(x=>x.punch_in_time&&new Date(x.punch_in_time).toDateString()===new Date().toDateString()&&!x.punch_out_time).length;
 const dueCount=billing.filter(x=>(x.due??0)>0).length;
 const renewalsSoon=members.filter(m=>{const d=daysLeft(m.expiry_date);return d>0&&d<=7}).length;
 const birthdaysSoon=members.filter(m=>isBirthdaySoon(m.dob,7)).length;
 const approve=async(id:number)=>{const item=pending.find(x=>x.id===id);if(!item)return;const {error}=await supabase.rpc('approve_member',{p_approval_id:id,p_package_name:'Monthly',p_amount:1500,p_package_months:1,p_discount:0,p_paid:1500});if(error){notify('Approval failed. Please check the registration.');return}notify(`${item.name||'Warrior'} approved and vault created.`);void load()};
 return <><Header onBack={onBack}/><div className="shell"><aside className="sidebar"><div className="side-label">Reception desk</div><nav className="nav">{([['overview','Overview',LayoutDashboard],['attendance','Manual Attendance',UserCheck],['join','New Member / Join',UserPlus],['approvals','Approvals',Bell],['members','Warriors',Users],['reminders','Due & Birthday Reminders',Bell],['notices','Notices & Freeze',Bell],['billing','Billing',CreditCard],['expenses','Expenses',Wallet],['inventory','Store Inventory',Dumbbell],['diary','Diary',FileText],['flyers','Flyer Studio',Sparkles],['ai','Omni AI Hub',Sparkles]] as const).map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon size={16}/>{label}{key==='approvals'&&pending.length>0&&<span className="pill red" style={{marginLeft:'auto',padding:'3px 6px'}}>{pending.length}</span>}</button>)}</nav><div style={{marginTop:24,padding:'0 14px'}}><a href="/villain" className="button ghost" style={{width:'100%',justifyContent:'center',fontSize:11}}><Skull size={13}/> Owner vault</a></div><div style={{marginTop:16,padding:'0 14px',color:'#607083',fontSize:11,lineHeight:1.6}}>Live sync active<br/><span style={{color:'#36d8d3'}}>Polling every 10 seconds</span></div><img src="/brand/team-badge.png" alt="RB Warriors" className="team-badge-mini" /></aside><main className="content">{tab==='overview'&&<Overview loading={loading} members={members} pending={pending} active={active} present={present} dueCount={dueCount} renewalsSoon={renewalsSoon} birthdaysSoon={birthdaysSoon} onApprovals={()=>setTab('approvals')} onRefresh={load}/>} {tab==='attendance'&&<ManualAttendance members={members} attendance={attendance} notify={notify} onRefresh={load}/>} {tab==='join'&&<JoinMember notify={notify} onRefresh={load}/>} {tab==='approvals'&&<Approvals pending={pending} onApprove={approve}/>} {tab==='members'&&<Members members={members}/>} {tab==='reminders'&&<Reminders members={members} billing={billing} notify={notify}/>} {tab==='notices'&&<NoticesDesk notify={notify}/>} {tab==='billing'&&<BillingView billing={billing} members={members}/>} {tab==='expenses'&&<Expenses expenses={expenses} onAdd={()=>setShowExpense(true)} onRefresh={load}/>} {tab==='inventory'&&<StoreInventory notify={notify}/>} {tab==='diary'&&<Diary notify={notify}/>} {tab==='flyers'&&<FlyerStudio/>} {tab==='ai'&&<AIHub members={members} notify={notify}/>}</main></div>{showExpense&&<ExpenseModal onClose={()=>setShowExpense(false)} onSaved={()=>{setShowExpense(false);notify('Expense logged.');void load()}}/>}</>;
}

function Overview(p:{loading:boolean;members:Member[];pending:PendingApproval[];active:number;present:number;dueCount:number;renewalsSoon:number;birthdaysSoon:number;onApprovals:()=>void;onRefresh:()=>void}) { return <><div className="page-head"><div><p className="eyebrow">Reception desk</p><h1 className="title">Good morning.</h1><p className="sub">Today's floor at a glance — financial reports live in the owner vault.</p></div><button className="button" onClick={p.onRefresh}><RefreshCw size={15}/> Sync now</button></div><div className="grid stats"><Stat icon={Users} label="Total warriors" value={p.members.length} foot={`${p.active} active memberships`} color="var(--gold)"/><Stat icon={Activity} label="On floor now" value={p.present} foot="Live attendance" color="var(--cyan)"/><Stat icon={Bell} label="Pending review" value={p.pending.length} foot="Needs your attention" color="var(--red)"/><Stat icon={Clock3} label="Dues to collect" value={p.dueCount} foot="Members with balance" color="var(--gold)"/></div><div className="grid layout-2"><div className="card"><div className="card-title">Renewals due soon <span>Next 7 days</span></div><div className="stat-value" style={{color:'var(--cyan)'}}>{p.renewalsSoon}</div><div className="result-label">Check the Reminders tab to notify them</div></div><div className="card"><div className="card-title">Birthdays this week <span>Send wishes</span></div><div className="stat-value" style={{color:'var(--gold)'}}>{p.birthdaysSoon}</div><div className="result-label">Check the Reminders tab for ready-made messages</div></div></div>{p.pending.length>0&&<div className="card" style={{marginTop:20}}><div className="card-title">Verification queue <span>Action required</span></div>{p.pending.slice(0,4).map(x=><div className="activity-item" style={{marginBottom:16}} key={x.id}><div className="activity-icon" style={{color:'var(--gold)'}}><Clock3 size={15}/></div><div className="activity-copy"><b>{x.name||'Unnamed applicant'}</b><small>{x.mobile} · {x.created_at?new Date(x.created_at).toLocaleDateString():'Recently'}</small></div><span className="pill red" style={{marginLeft:'auto'}}>NEW</span></div>)}<button className="button ghost" onClick={p.onApprovals} style={{width:'100%',justifyContent:'center',marginTop:8}}>Review queue <ArrowRight size={14}/></button></div>}</>; }
function Stat({icon:Icon,label,value,foot,color}:{icon:typeof Users;label:string;value:string|number;foot:string;color:string}){return <div className="card stat" style={{'--accent':color} as CSSProperties}><div className="stat-top"><span>{label}</span><Icon size={17} color={color}/></div><div className="stat-value">{value}</div><div className="stat-foot" style={{color}}>{foot}</div></div>}

function Approvals({pending,onApprove}:{pending:PendingApproval[];onApprove:(id:number)=>void}){return <><div className="page-head"><div><p className="eyebrow">Smart verification queue</p><h1 className="title">New warriors</h1><p className="sub">Review applications and open their Ghost Vault.</p></div></div><div className="card"><div className="toolbar"><div className="card-title" style={{margin:0}}>Awaiting commander review <span>{pending.length} requests</span></div><button className="button"><FileText size={15}/> Export queue</button></div>{pending.length?<div className="table-wrap"><table className="table"><thead><tr><th>Applicant</th><th>Contact</th><th>Goal</th><th>Received</th><th></th></tr></thead><tbody>{pending.map(x=><tr key={x.id}><td><b>{x.name||'Unnamed'}</b><div className="muted">#{String(x.id).padStart(4,'0')}</div></td><td>{x.mobile}<div className="muted">{x.email||'No email'}</div></td><td>{x.goal||'General fitness'}</td><td>{x.created_at?new Date(x.created_at).toLocaleDateString():'—'}</td><td><button className="button primary" onClick={()=>onApprove(x.id)}><Check size={14}/> Approve</button></td></tr>)}</tbody></table></div>:<div className="empty">No pending applications. The queue is clear.</div>}</div></>}
function Members({members}:{members:Member[]}){const [q,setQ]=useState('');const filtered=members.filter(x=>(x.name||'').toLowerCase().includes(q.toLowerCase())||x.member_id.toLowerCase().includes(q.toLowerCase())||x.phone.includes(q));return <><div className="page-head"><div><p className="eyebrow">Cloud database manager</p><h1 className="title">Warrior directory</h1><p className="sub">Every member, one living record.</p></div></div><div className="card"><div className="toolbar"><div className="card-title" style={{margin:0}}>Registered warriors <span>{filtered.length} shown</span></div><div style={{position:'relative'}}><Search size={14} color="#728297" style={{position:'absolute',left:12,top:12}}/><input className="search" style={{paddingLeft:34}} placeholder="Search name or ID" value={q} onChange={e=>setQ(e.target.value)}/></div></div>{filtered.length?<div className="table-wrap"><table className="table"><thead><tr><th>Warrior</th><th>Phone</th><th>Package</th><th>Expires</th><th>Status</th></tr></thead><tbody>{filtered.map(x=><tr key={x.member_id}><td><b>{x.name||'Unknown'}</b><div className="muted">{x.member_id}</div></td><td>{x.phone}</td><td>{x.package||'—'}</td><td>{x.expiry_date||'—'}</td><td><span className={daysLeft(x.expiry_date)>0?'pill':'pill red'}>{daysLeft(x.expiry_date)>0?'ACTIVE':'EXPIRED'}</span></td></tr>)}</tbody></table></div>:<div className="empty">No warriors found.</div>}</div></>}
function BillingView({billing,members}:{billing:Billing[];members:Member[]}){const name=(id:string|null)=>members.find(m=>m.member_id===id)?.name||id||'Unknown';const [upiVpa,setUpiVpa]=useState('');useEffect(()=>{void supabase.from('gym_settings').select('value').eq('key','upi_vpa').maybeSingle().then(({data})=>setUpiVpa(data?.value||''))},[]);return <><div className="page-head"><div><p className="eyebrow">Reception ledger</p><h1 className="title">Invoices & dues</h1><p className="sub">Chase what's owed. Full revenue and profit reports live in the owner vault.</p></div><button className="button primary"><CreditCard size={15}/> Create invoice</button></div><div className="grid stats"><Stat icon={Clock3} label="Outstanding" value={money(billing.reduce((s,x)=>s+(x.due??0),0))} foot="Needs follow-up" color="var(--red)"/><Stat icon={FileText} label="Invoices" value={billing.length} foot="Total records" color="var(--cyan)"/><Stat icon={UserCheck} label="Fully paid" value={billing.filter(x=>(x.due??0)===0).length} foot="No balance owed" color="var(--green)"/><Stat icon={Bell} label="Needs follow-up" value={billing.filter(x=>(x.due??0)>0).length} foot="Has a balance" color="var(--gold)"/></div>{!upiVpa&&<p className="muted" style={{fontSize:12,marginBottom:10}}>Set a UPI ID in the owner vault to enable QR payments on invoices.</p>}<div className="card"><div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Warrior</th><th>Package</th><th>Paid</th><th>Due</th><th></th></tr></thead><tbody>{billing.map(x=><tr key={x.id}><td>INV-{String(x.id).padStart(5,'0')}</td><td><b>{name(x.member_id)}</b><div className="muted">{x.member_id}</div></td><td>{x.package_name||'—'}</td><td style={{color:'var(--green)'}}>{money(x.paid)}</td><td style={{color:(x.due??0)>0?'var(--red)':'var(--green)'}}>{money(x.due)}</td><td style={{display:'flex',gap:6}}><button className="button ghost" style={{padding:'7px 9px'}}><FileText size={14}/></button>{(x.due??0)>0&&<UpiQrButton vpa={upiVpa} amount={x.due??0} note={`INV-${x.id}`}/>}</td></tr>)}</tbody></table></div>{!billing.length&&<div className="empty">No billing records yet.</div>}</div></>}
function Expenses({expenses,onAdd,onRefresh}:{expenses:{id:number;expense_name:string|null;amount:number|null;expense_date:string|null}[];onAdd:()=>void;onRefresh:()=>void}){return <><div className="page-head"><div><p className="eyebrow">Operating costs</p><h1 className="title">Expense tracker</h1><p className="sub">Know where every rupee goes.</p></div><button className="button primary" onClick={onAdd}><Wallet size={15}/> Log expense</button></div><div className="card"><div className="toolbar"><div className="card-title" style={{margin:0}}>Recent expenses</div><button className="button ghost" onClick={onRefresh}><RefreshCw size={14}/></button></div><table className="table"><thead><tr><th>Description</th><th>Date</th><th>Amount</th></tr></thead><tbody>{expenses.map(x=><tr key={x.id}><td>{x.expense_name||'General expense'}</td><td>{x.expense_date||'—'}</td><td style={{color:'var(--red)'}}>{money(x.amount)}</td></tr>)}</tbody></table>{!expenses.length&&<div className="empty">No expenses logged.</div>}</div></>}
function ExpenseModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){const [name,setName]=useState('');const [amount,setAmount]=useState('');const [saving,setSaving]=useState(false);const save=async(e:FormEvent)=>{e.preventDefault();setSaving(true);const {error}=await supabase.from('expenses').insert({expense_name:name,amount:Number(amount)});setSaving(false);if(!error)onSaved()};return <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><p className="eyebrow">New ledger entry</p><h2 style={{margin:0}}>Log expense</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div><div className="form-grid"><div className="field full"><label>Description</label><input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Electricity bill"/></div><div className="field"><label>Amount</label><input required type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></div></div><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Saving...':'Save expense'}</button></div></form></div>}

function AIHub({members,notify}:{members:Member[];notify:(m:string)=>void}){const [member,setMember]=useState('');const [goal,setGoal]=useState('Build a balanced 4-day strength program with warm-ups and progression.');const [plan,setPlan]=useState<{title:string;days:string[];notes:string}|null>(null);const generate=()=>{const target=members.find(m=>m.member_id===member)?.name||'your warrior';setPlan({title:`${target}'s Strength Protocol`,days:['Day 01 · Upper push — chest, shoulders, triceps','Day 02 · Lower strength — quads, hamstrings, core','Day 03 · Recovery — mobility and 25 min zone 2','Day 04 · Upper pull — back, biceps, rear delts'],notes:'Start every session with 8 minutes of movement prep. Add one rep before adding load. Sleep 7–8 hours and hydrate consistently.'});notify('AI plan drafted. Review before assigning.');};return <><div className="page-head"><div><p className="eyebrow">Gemini + Groq fallback core</p><h1 className="title">Omni AI Hub</h1><p className="sub">Draft a plan, then assign it to a warrior.</p></div><span className="pill">AI READY</span></div><div className="grid layout-2"><div className="card"><div className="field"><label>Assign to warrior</label><select value={member} onChange={e=>setMember(e.target.value)}><option value="">Select a warrior</option>{members.map(m=><option key={m.member_id} value={m.member_id}>{m.name||m.member_id} · {m.member_id}</option>)}</select></div><div className="field" style={{marginTop:16}}><label>Coach prompt</label><textarea value={goal} onChange={e=>setGoal(e.target.value)}/></div><button className="button cyan" style={{marginTop:18}} onClick={generate}><Sparkles size={15}/> Generate training plan</button></div><div className="card">{plan?<><div className="card-title">{plan.title}<span>Draft</span></div><div className="activity">{plan.days.map(x=><div className="activity-item" key={x}><div className="activity-icon"><Dumbbell size={15}/></div><div className="activity-copy">{x}</div></div>)}</div><p className="sub" style={{lineHeight:1.6}}>{plan.notes}</p><button className="button primary" style={{marginTop:10}} onClick={()=>notify('Plan assigned to the selected warrior.')}>Assign plan</button></>:<div className="empty"><Sparkles size={24} style={{marginBottom:10}}/><br/>Your generated plan will appear here.</div>}</div></div></>}

function Portal({onBack,notify}:{onBack:()=>void;notify:(m:string)=>void}){const [memberId,setMemberId]=useState('');const [passcode,setPasscode]=useState('');const [member,setMember]=useState<Member|null>(null);const [loginError,setLoginError]=useState('');const login=async(e:FormEvent)=>{e.preventDefault();setLoginError('');const {data,error}=await supabase.from('ghost_vault').select('member_id,passcode').eq('member_id',memberId.trim()).eq('passcode',passcode.trim()).maybeSingle();if(error||!data){setLoginError('Warrior ID or passcode not recognised.');return}const result=await supabase.from('members').select('*').eq('member_id',data.member_id).maybeSingle();if(result.data)setMember(result.data);else setLoginError('Your vault profile could not be loaded.');};return <><Header onBack={onBack}/>{!member?<main className="portal-login"><div className="card"><p className="eyebrow">Warrior portal</p><h1 className="title">Enter the vault.</h1><p className="sub">Use the ID and secret passcode sent when your membership was approved.</p><form onSubmit={login} style={{marginTop:26}}><div className="field"><label>Warrior ID</label><input required value={memberId} onChange={e=>setMemberId(e.target.value.toUpperCase())} placeholder="e.g. SRB92900001"/></div><div className="field" style={{marginTop:14}}><label>Secret passcode</label><input required type="password" inputMode="numeric" maxLength={4} value={passcode} onChange={e=>setPasscode(e.target.value)} placeholder="4 digits"/></div>{loginError&&<p className="error" style={{fontSize:12}}>{loginError}</p>}<button className="button cyan" style={{width:'100%',justifyContent:'center',marginTop:20}}><LogIn size={15}/> Unlock my portal</button></form><a href="/join" className="button ghost" style={{width:'100%',justifyContent:'center',marginTop:14}}><UserPlus size={15}/> New here? Join Bhajrang Fitness</a></div></main>:<MemberPortal member={member} onLogout={()=>setMember(null)} notify={notify}/>}</>}
function MemberPortal({member,onLogout,notify}:{member:Member;onLogout:()=>void;notify:(m:string)=>void}){
  const [history,setHistory]=useState<AttendanceLog[]>([]);
  const [showRenew,setShowRenew]=useState(false);
  const [showFreeze,setShowFreeze]=useState(false);
  const [notices,setNotices]=useState<{id:string;title:string;body:string}[]>([]);
  useEffect(()=>{void supabase.from('attendance_logs').select('*').eq('member_id',member.member_id).order('punch_in_time',{ascending:false}).limit(8).then(({data})=>setHistory(data??[]))},[member.member_id]);
  useEffect(()=>{void supabase.from('notices').select('id,title,body').eq('active',true).order('created_at',{ascending:false}).limit(3).then(({data})=>setNotices(data??[]))},[]);
  return <><main className="portal">{notices.length>0&&<div className="card" style={{marginBottom:18,borderColor:'var(--gold)'}}><div className="card-title"><Bell size={15} color="var(--gold)"/> Gym notices</div>{notices.map(n=><div key={n.id} style={{marginBottom:8}}><b>{n.title}</b>{n.body&&<p className="muted" style={{margin:'2px 0 0'}}>{n.body}</p>}</div>)}</div>}<div className="portal-head"><div><p className="eyebrow">Welcome back, warrior</p><h1 className="title">{member.name||member.member_id}</h1><p className="sub">{member.member_id} · {member.package||'Active member'}</p></div><button className="button ghost" onClick={onLogout}><LogOut size={15}/> Lock vault</button></div><div className="grid portal-grid"><div className="card" style={{textAlign:'center'}}><div className="card-title">Digital gate pass <span>Scan at entrance</span></div><div className="qr"><QRCodeSVG value={member.member_id} size={190}/></div><p className="sub">Show this code to the AI kiosk</p></div><div className="card"><div className="card-title">Membership status <span className="pill">{daysLeft(member.expiry_date)>0?'ACTIVE':'EXPIRED'}</span></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'end'}}><div><div className="stat-value" style={{color:'var(--cyan)'}}>{daysLeft(member.expiry_date)}</div><div className="result-label">days remaining</div></div><Target size={42} color="var(--gold)"/></div><div className="progress"><i style={{width:`${Math.min(100,Math.max(4,daysLeft(member.expiry_date)/30*100))}%`}}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:14,fontSize:12}}><span className="muted">Started</span><b>{member.joining_date||'—'}</b><span className="muted">Expires</span><b>{member.expiry_date||'—'}</b></div><div style={{display:'flex',gap:8,marginTop:16}}><button className="button primary" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowRenew(true)}><CreditCard size={15}/> Renew</button><button className="button ghost" style={{flex:1,justifyContent:'center'}} onClick={()=>setShowFreeze(true)}><Clock3 size={15}/> Freeze</button></div></div><div className="card"><div className="card-title">My recent attendance <span>Last 8 visits</span></div>{history.length?<div className="activity">{history.map(x=><div className="activity-item" key={x.id}><div className="activity-icon"><UserCheck size={15}/></div><div className="activity-copy">{x.punch_in_time?new Date(x.punch_in_time).toLocaleDateString():'—'}<small>{x.punch_in_time?new Date(x.punch_in_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''} {x.punch_out_time?`→ ${new Date(x.punch_out_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:'(still in)'}</small></div></div>)}</div>:<div className="empty">No visits logged yet.</div>}</div></div><Calculators notify={notify}/></main>{showRenew&&<RenewModal member={member} onClose={()=>setShowRenew(false)} onSaved={()=>notify('Renewal request sent — pay via the QR shown, or at reception.')}/>}{showFreeze&&<FreezeModal member={member} onClose={()=>setShowFreeze(false)} onSaved={()=>{setShowFreeze(false);notify('Freeze request sent to reception.')}}/>}</>;
}
function FreezeModal({member,onClose,onSaved}:{member:Member;onClose:()=>void;onSaved:()=>void}){
  const [reason,setReason]=useState('');const [saving,setSaving]=useState(false);
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);const {error}=await supabase.from('freeze_requests').insert({member_id:member.member_id,reason});setSaving(false);if(!error)onSaved()};
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Freeze request</p><h2 style={{margin:0}}>Pause your membership</h2><p className="sub">Reception will review and confirm your freeze period.</p></div><button type="button" className="close" onClick={onClose}><X/></button></div><div className="field full"><label>Reason (optional)</label><textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. traveling for 3 weeks"/></div><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Sending...':'Send request'}</button></div></form></div>;
}
function RenewModal({member,onClose,onSaved}:{member:Member;onClose:()=>void;onSaved:()=>void}){
  const [pkg,setPkg]=useState('Monthly');const [saving,setSaving]=useState(false);const [submitted,setSubmitted]=useState(false);const [vpa,setVpa]=useState('');
  const PRICES:Record<string,number>={Monthly:1500,Quarterly:4000,'Half-Yearly':7500,Yearly:14000};
  useEffect(()=>{void supabase.from('gym_settings').select('value').eq('key','upi_vpa').maybeSingle().then(({data})=>setVpa(data?.value||''))},[]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);const {error}=await supabase.from('billing').insert({member_id:member.member_id,package_name:pkg,amount:PRICES[pkg],discount:0,paid:0,due:PRICES[pkg],payment_date:new Date().toISOString().slice(0,10)});setSaving(false);if(!error){setSubmitted(true);onSaved()}};
  if(submitted) return <div className="modal-backdrop"><div className="modal" style={{textAlign:'center'}}><div className="modal-head"><div><p className="eyebrow">Request sent</p><h2 style={{margin:0}}>Pay {money(PRICES[pkg])} to activate</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div>{vpa?<><div style={{display:'flex',justifyContent:'center',margin:'16px 0'}}><QRCodeSVG value={upiLink(vpa,'Bhajrang Fitness',PRICES[pkg],`${member.member_id} ${pkg}`)} size={180}/></div><p className="sub">Scan with any UPI app, then show reception the payment confirmation.</p></>:<p className="sub">Reception will share a payment link or collect this in person.</p>}<button className="button primary full" style={{marginTop:16}} onClick={onClose}>Done</button></div></div>;
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Renewal request</p><h2 style={{margin:0}}>Renew your membership</h2><p className="sub">This creates a pending invoice you can pay instantly via UPI, or at reception.</p></div><button type="button" className="close" onClick={onClose}><X/></button></div><div className="form-grid"><div className="field full"><label>Choose package</label><select value={pkg} onChange={e=>setPkg(e.target.value)}>{Object.keys(PRICES).map(k=><option key={k}>{k}</option>)}</select></div></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}><span className="muted">Amount due</span><b>{money(PRICES[pkg])}</b></div><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Sending...':'Send request'}</button></div></form></div>;
}
function Calculators({notify}:{notify:(m:string)=>void}){const [height,setHeight]=useState('175');const [weight,setWeight]=useState('75');const bmi=(Number(weight)/(Number(height)/100)**2||0).toFixed(1);const [oneRmWeight,setOneRmWeight]=useState('60');const [reps,setReps]=useState('8');const oneRm=(Number(oneRmWeight)*(1+Number(reps)/30)||0).toFixed(1);const [age,setAge]=useState('28');const bmr=(10*Number(weight)+6.25*Number(height)-5*Number(age)+5||0).toFixed(0);const [activity,setActivity]=useState('1.55');const tdee=(Number(bmr)*Number(activity)||0).toFixed(0);const [neck,setNeck]=useState('38');const [waist,setWaist]=useState('85');const [sex,setSex]=useState('Male');const [hip,setHip]=useState('95');const bodyFat=sex==='Male'?(495/(1.0324-0.19077*Math.log10(Number(waist)-Number(neck))+0.15456*Math.log10(Number(height)))-450):(495/(1.29579-0.35004*Math.log10(Number(waist)+Number(hip)-Number(neck))+0.22100*Math.log10(Number(height)))-450);return <section style={{marginTop:32}}><div className="card-title">Performance lab <span>Personal analytics</span></div><div className="grid calc-grid"><div className="card"><div className="card-title"><BarChart3 size={16} color="var(--cyan)"/> BMI engine</div><div className="form-grid"><div className="field"><label>Height (cm)</label><input type="number" value={height} onChange={e=>setHeight(e.target.value)}/></div><div className="field"><label>Weight (kg)</label><input type="number" value={weight} onChange={e=>setWeight(e.target.value)}/></div></div><div className="calc-result">{bmi}</div><div className="result-label">{Number(bmi)<18.5?'Below range':Number(bmi)<25?'Healthy range':'Above range'}</div></div><div className="card"><div className="card-title"><Zap size={16} color="var(--gold)"/> 1RM estimator</div><div className="form-grid"><div className="field"><label>Weight (kg)</label><input type="number" value={oneRmWeight} onChange={e=>setOneRmWeight(e.target.value)}/></div><div className="field"><label>Reps</label><input type="number" value={reps} onChange={e=>setReps(e.target.value)}/></div></div><div className="calc-result">{oneRm} kg</div><div className="result-label">Estimated one-rep max</div></div><div className="card"><div className="card-title"><Activity size={16} color="var(--green)"/> BMR baseline</div><div className="field"><label>Age</label><input type="number" value={age} onChange={e=>setAge(e.target.value)}/></div><div className="calc-result">{bmr}</div><div className="result-label">Estimated calories / day</div></div><div className="card"><div className="card-title"><Flame size={16} color="var(--red)"/> TDEE (with activity)</div><div className="field"><label>Activity level</label><select value={activity} onChange={e=>setActivity(e.target.value)}><option value="1.2">Sedentary (desk job)</option><option value="1.375">Light (1-3 workouts/week)</option><option value="1.55">Moderate (3-5 workouts/week)</option><option value="1.725">Heavy (6-7 workouts/week)</option><option value="1.9">Athlete (2x/day)</option></select></div><div className="calc-result">{tdee}</div><div className="result-label">Calories to maintain current weight</div></div><div className="card"><div className="card-title"><Target size={16} color="var(--gold)"/> Body fat % (Navy method)</div><div className="form-grid"><div className="field"><label>Sex</label><select value={sex} onChange={e=>setSex(e.target.value)}><option>Male</option><option>Female</option></select></div><div className="field"><label>Neck (cm)</label><input type="number" value={neck} onChange={e=>setNeck(e.target.value)}/></div><div className="field"><label>Waist (cm)</label><input type="number" value={waist} onChange={e=>setWaist(e.target.value)}/></div>{sex==='Female'&&<div className="field"><label>Hip (cm)</label><input type="number" value={hip} onChange={e=>setHip(e.target.value)}/></div>}</div><div className="calc-result">{isFinite(bodyFat)&&bodyFat>0?bodyFat.toFixed(1):'—'}%</div><div className="result-label">Estimated body fat</div></div><div className="card"><div className="card-title"><DropletIcon/> Hydration target</div><div className="calc-result">{(Number(weight)*.035).toFixed(1)} L</div><div className="result-label">Daily baseline · add 500ml per workout</div></div><div className="card"><div className="card-title"><HeartIcon/> Cardio HR zone</div><div className="calc-result">{Math.round(208-.7*Number(age))}</div><div className="result-label">Estimated max heart rate</div></div><div className="card"><div className="card-title"><Calculator size={16} color="var(--blue)"/> Macro guide</div><div className="calc-result">{Number(weight)*2}g</div><div className="result-label">Daily protein target</div><div style={{display:'flex',justifyContent:'space-between',marginTop:10,fontSize:12}}><span className="muted">Carbs</span><b>{Math.round(Number(tdee)*0.4/4)}g</b><span className="muted">Fat</span><b>{Math.round(Number(tdee)*0.25/9)}g</b></div></div></div></section>}
function DropletIcon(){return <span style={{color:'var(--cyan)'}}>◈</span>} function HeartIcon(){return <span style={{color:'var(--red)'}}>♡</span>}

function Kiosk({onBack,notify}:{onBack:()=>void;notify:(m:string)=>void}){const [code,setCode]=useState('');const [message,setMessage]=useState('');const [logs,setLogs]=useState<{id:string;name:string;action:string;time:string}[]>([]);const scan=async(e:FormEvent)=>{e.preventDefault();if(!code.trim())return;const {data}=await supabase.from('members').select('*').eq('member_id',code.trim().toUpperCase()).maybeSingle();if(!data){setMessage('ACCESS DENIED · ID NOT FOUND');notify('Warrior ID not found.');setCode('');return}const today=new Date().toISOString().slice(0,10);const existing=await supabase.from('attendance_logs').select('*').eq('member_id',data.member_id).gte('punch_in_time',`${today}T00:00:00`).order('punch_in_time',{ascending:false}).limit(1).maybeSingle();let action='CHECK-IN';if(existing.data&&!existing.data.punch_out_time){await supabase.from('attendance_logs').update({punch_out_time:new Date().toISOString(),status:'CHECKED_OUT'}).eq('id',existing.data.id);action='CHECK-OUT'}else{await supabase.from('attendance_logs').insert({member_id:data.member_id,status:'CHECKED_IN'});}setMessage(`${action} · ${data.name||data.member_id}`);setLogs(x=>[{id:data.member_id,name:data.name||data.member_id,action,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})},...x].slice(0,6));setCode('');};return <main className="kiosk"><div className="kiosk-inner"><div className="kiosk-head"><Brand/><div style={{display:'flex',alignItems:'center',gap:15}}><span className="status-dot"><i className="dot"/> SCANNER READY</span><button className="button ghost" onClick={onBack}><ArrowLeft size={15}/> Exit</button></div></div><div className="scan-box"><p className="kicker">BHAJRANG AI KIOSK // GATE 01</p><h1 className="title">Scan to enter.</h1><p className="sub">Present your QR pass or type your Warrior ID.</p><div className="scan-frame"><div className="scan-line"/><Radio size={48} strokeWidth={1}/></div><form onSubmit={scan}><input autoFocus className="kiosk-input" value={code} onChange={e=>setCode(e.target.value)} placeholder="WARRIOR ID"/></form>{message&&<p className={message.includes('DENIED')?'error':'success'} style={{fontSize:13,letterSpacing:'.08em',marginTop:20}}>{message}</p>}<div className="log-list" style={{textAlign:'left'}}>{logs.length>0&&<p className="eyebrow" style={{margin:'18px 0 0'}}>Live action log</p>}{logs.map(x=><div className="log" key={x.id+x.time}><span><b>{x.name}</b> · {x.action}</span><span>{x.time}</span></div>)}</div></div></div></main>}

function VillainGate({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(VILLAIN_SESSION_KEY) === '1');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (pass === VILLAIN_PASSCODE) { sessionStorage.setItem(VILLAIN_SESSION_KEY, '1'); setUnlocked(true); notify('Villain vault unlocked.'); } else { setError('Incorrect passcode.'); setPass(''); } };
  if (unlocked) return <VillainVault onBack={onBack} notify={notify} onLock={() => { sessionStorage.removeItem(VILLAIN_SESSION_KEY); setUnlocked(false); }} />;
  return <main className="portal-login"><div className="card" style={{maxWidth:380,margin:'8vh auto'}}>
    <div style={{display:'flex',justifyContent:'center',marginBottom:14}}><img src="/brand/owner-photo.png" alt="" className="villain-photo" /></div>
    <p className="eyebrow" style={{textAlign:'center'}}>Owner only</p>
    <h1 className="title" style={{textAlign:'center'}}>Villain Vault</h1>
    <p className="sub" style={{textAlign:'center'}}>This is your private master control. Enter the passcode.</p>
    <form onSubmit={submit} style={{marginTop:24}}>
      <div className="field"><label>Passcode</label><input autoFocus type="password" inputMode="numeric" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••" /></div>
      {error && <p className="error" style={{fontSize:12}}>{error}</p>}
      <button className="button primary" style={{width:'100%',justifyContent:'center',marginTop:18}}><Lock size={15}/> Unlock vault</button>
    </form>
    <button className="button ghost" style={{width:'100%',justifyContent:'center',marginTop:10}} onClick={onBack}><ArrowLeft size={14}/> Back to desk</button>
    <p className="muted" style={{fontSize:11,marginTop:16,textAlign:'center',lineHeight:1.6}}><ShieldAlert size={12} style={{verticalAlign:'middle',marginRight:4}}/>This is a client-side lock for a private deployment — it hides the vault from casual visitors but is not a substitute for real authentication if this URL is ever shared publicly.</p>
  </div></main>;
}

function VillainVault({ onBack, onLock, notify }: { onBack: () => void; onLock: () => void; notify: (m: string) => void }) {
  const [tab, setTab] = useState<'overview' | 'finance' | 'staff' | 'settings' | 'data'>('overview');
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
      supabase.from('staff').select('*').order('created_at', { ascending: false }),
    ]);
    setMembers(m.data ?? []); setBilling(b.data ?? []); setExpenses(e.data ?? []); setAttendance(a.data ?? []); setStaff((s.data as Staff[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const revenue = billing.reduce((s, x) => s + (x.paid ?? 0), 0);
  const expenseTotal = expenses.reduce((s, x) => s + (x.amount ?? 0), 0);
  const net = revenue - expenseTotal;
  return <><Header onBack={onBack} /><div className="shell"><aside className="sidebar">
    <div className="side-label">Villain vault</div>
    <nav className="nav">
      {([['overview','Master overview',Skull],['finance','Financial Planner',BarChart3],['staff','Staff control',UserPlus],['settings','Payment Settings',CreditCard],['data','Data & exports',Download]] as const).map(([key,label,Icon]) =>
        <button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon size={16}/>{label}</button>)}
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
    {tab === 'staff' && <StaffControl staff={staff} onRefresh={load} notify={notify} />}
    {tab === 'settings' && <PaymentSettings notify={notify} />}
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

function StaffControl({ staff, onRefresh, notify }: { staff: Staff[]; onRefresh: () => void; notify: (m: string) => void }) {
  const [form, setForm] = useState({ name: '', role: 'Trainer', phone: '', passcode: '' });
  const [saving, setSaving] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('staff').insert({ name: form.name, role: form.role, phone: form.phone, passcode: form.passcode || String(Math.floor(1000 + Math.random() * 9000)), active: true });
    setSaving(false);
    if (error) { notify('Could not add staff member.'); return; }
    setForm({ name: '', role: 'Trainer', phone: '', passcode: '' }); notify(`${form.name} added to staff.`); onRefresh();
  };
  const toggle = async (s: Staff) => { await supabase.from('staff').update({ active: !s.active }).eq('id', s.id); onRefresh(); };
  const remove = async (s: Staff) => { await supabase.from('staff').delete().eq('id', s.id); notify(`${s.name} removed.`); onRefresh(); };
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

function JoinMember({ notify, onRefresh }: { notify: (m: string) => void; onRefresh: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', dob: '', gender: 'Male', package: 'Monthly', amount: '1500', months: '1' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ memberId: string; passcode: string } | null>(null);
  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    const memberId = `SRB${Math.floor(90000000 + Math.random() * 9999999)}`;
    const passcode = String(Math.floor(1000 + Math.random() * 9000));
    const expiry = new Date(); expiry.setMonth(expiry.getMonth() + Number(form.months || 1));
    const { error: mErr } = await supabase.from('members').insert({ member_id: memberId, name: form.name, phone: form.phone, dob: form.dob || null, gender: form.gender, joining_date: new Date().toISOString().slice(0, 10), package: form.package, expiry_date: expiry.toISOString().slice(0, 10) });
    if (mErr) { setSaving(false); notify('Could not create member. Check the phone/ID fields.'); return; }
    await supabase.from('ghost_vault').insert({ member_id: memberId, passcode });
    await supabase.from('billing').insert({ member_id: memberId, package_name: form.package, amount: Number(form.amount), discount: 0, paid: Number(form.amount), due: 0, payment_date: new Date().toISOString().slice(0, 10), expiry_date: expiry.toISOString().slice(0, 10) });
    setSaving(false); setCreated({ memberId, passcode }); notify(`${form.name} joined RBF.`); onRefresh();
    setForm({ name: '', phone: '', dob: '', gender: 'Male', package: 'Monthly', amount: '1500', months: '1' });
  };
  return <><div className="page-head"><div><p className="eyebrow">Reception</p><h1 className="title">New Member / Walk-in Join</h1><p className="sub">For someone joining in person right now — creates their Warrior ID and vault instantly.</p></div></div>
    <div className="grid layout-2">
      <div className="card"><div className="card-title">Member details</div>
        <form onSubmit={submit} className="form-grid">
          <div className="field"><label>Full name</label><input required value={form.name} onChange={update('name')} /></div>
          <div className="field"><label>Phone</label><input required value={form.phone} onChange={update('phone')} /></div>
          <div className="field"><label>Date of birth</label><input type="date" value={form.dob} onChange={update('dob')} /></div>
          <div className="field"><label>Gender</label><select value={form.gender} onChange={update('gender')}><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div className="field"><label>Package</label><select value={form.package} onChange={update('package')}><option>Monthly</option><option>Quarterly</option><option>Half-Yearly</option><option>Yearly</option></select></div>
          <div className="field"><label>Duration (months)</label><input type="number" value={form.months} onChange={update('months')} /></div>
          <div className="field"><label>Amount paid (₹)</label><input type="number" value={form.amount} onChange={update('amount')} /></div>
          <button className="button primary full" disabled={saving} style={{gridColumn:'1 / -1'}}><UserPlus size={15}/> {saving?'Creating vault...':'Join & create Warrior ID'}</button>
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
  const copy = (text: string, label: string) => { navigator.clipboard?.writeText(text); notify(`${label} copied — paste it anywhere.`); };
  return <><div className="page-head"><div><p className="eyebrow">Reception follow-ups</p><h1 className="title">Due & Birthday Reminders</h1><p className="sub">Tap the WhatsApp icon to open a pre-filled chat directly — free, uses your own WhatsApp, no messaging subscription.</p></div></div>
    <div className="grid layout-2">
      <div className="card"><div className="card-title">Renewals due soon <span>{renewals.length}</span></div>
        {renewals.length ? <div className="activity">{renewals.map(m => { const msg=`Hi ${m.name||'there'}, your Bhajrang Fitness membership expires on ${m.expiry_date}. Renew soon to keep your streak going! 💪`; return <div className="activity-item" key={m.member_id}><div className="activity-icon"><Clock3 size={15}/></div><div className="activity-copy"><b>{m.name||m.member_id}</b><small>{m.phone} · expires in {daysLeft(m.expiry_date)}d ({m.expiry_date})</small></div><div style={{display:'flex',gap:6}}>{m.phone&&<a className="button cyan" style={{padding:'6px 8px'}} href={waLink(m.phone,msg)} target="_blank" rel="noreferrer"><Smartphone size={13}/></a>}<button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>copy(msg,'Renewal message')}><FileText size={13}/></button></div></div>; })}</div> : <div className="empty">No renewals due in the next two weeks.</div>}
      </div>
      <div className="card"><div className="card-title">Birthdays this week <span>{birthdays.length}</span></div>
        {birthdays.length ? <div className="activity">{birthdays.map(m => { const msg=`Happy Birthday ${m.name||''}! 🎉 Team Bhajrang Fitness wishes you a strong and healthy year ahead. See you at the gym!`; return <div className="activity-item" key={m.member_id}><div className="activity-icon"><Sparkles size={15}/></div><div className="activity-copy"><b>{m.name||m.member_id}</b><small>{m.phone}</small></div><div style={{display:'flex',gap:6}}>{m.phone&&<a className="button cyan" style={{padding:'6px 8px'}} href={waLink(m.phone,msg)} target="_blank" rel="noreferrer"><Smartphone size={13}/></a>}<button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>copy(msg,'Birthday message')}><FileText size={13}/></button></div></div>; })}</div> : <div className="empty">No birthdays in the next 7 days.</div>}
      </div>
      <div className="card" style={{gridColumn:'1 / -1'}}><div className="card-title">Payment follow-ups <span>{dues.length}</span></div>
        {dues.length ? <div className="activity">{dues.map(x => { const phone=duePhone(x.member_id); const msg=`Hi ${dueName(x.member_id)}, a friendly reminder that ${money(x.due)} is pending on your Bhajrang Fitness account. Please clear it at your convenience. Thank you!`; return <div className="activity-item" key={x.id}><div className="activity-icon"><CircleDollarSign size={15}/></div><div className="activity-copy"><b>{dueName(x.member_id)}</b><small>{money(x.due)} outstanding</small></div><div style={{display:'flex',gap:6}}>{phone&&<a className="button cyan" style={{padding:'6px 8px'}} href={waLink(phone,msg)} target="_blank" rel="noreferrer"><Smartphone size={13}/></a>}<button className="button ghost" style={{padding:'6px 8px'}} onClick={()=>copy(msg,'Due reminder')}><FileText size={13}/></button></div></div>; })}</div> : <div className="empty">No outstanding dues.</div>}
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

function PublicSignup() {
  const [form, setForm] = useState({
    name: '', mobile: '', whatsapp: '', email: '', dob: '', gender: 'Male', bloodGroup: '', maritalStatus: '',
    fatherName: '', govtId: '', occupation: '', gymExperience: '',
    address: '', city: '', state: '', pin: '',
    heightCm: '', weightKg: '', medicalConditions: '', goal: '',
    consent: false,
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(x => ({ ...x, [key]: e.target.value }));
  const bmi = form.heightCm && form.weightKg ? (Number(form.weightKg) / ((Number(form.heightCm) / 100) ** 2)) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    if (!form.consent) { setErrorMsg('Please confirm the health information consent to continue.'); return; }
    setSaving(true);
    const { error } = await supabase.from('pending_approvals').insert({
      name: form.name, mobile: form.mobile, whatsapp: form.whatsapp || form.mobile, email: form.email, dob: form.dob,
      gender: form.gender, blood_group: form.bloodGroup, marital_status: form.maritalStatus,
      father_name: form.fatherName, govt_id: form.govtId, occupation: form.occupation, gym_experience_years: form.gymExperience,
      address: form.address, city: form.city, state: form.state, pin: form.pin,
      height_cm: form.heightCm ? Number(form.heightCm) : null, weight_kg: form.weightKg ? Number(form.weightKg) : null,
      medical_conditions: form.medicalConditions, goal: form.goal, health_consent: form.consent, status: 'PENDING',
    });
    setSaving(false);
    if (error) { setErrorMsg('Something went wrong submitting your application. Please try again.'); return; }
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

function PaymentSettings({ notify }: { notify: (m: string) => void }) {
  const [vpa, setVpa] = useState(''); const [address, setAddress] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { void supabase.from('gym_settings').select('key,value').in('key', ['upi_vpa', 'gym_address']).then(({ data }) => { data?.forEach(r => { if (r.key === 'upi_vpa') setVpa(r.value || ''); if (r.key === 'gym_address') setAddress(r.value || ''); }); }); }, []);
  const save = async (e: FormEvent) => { e.preventDefault(); setSaving(true); await supabase.from('gym_settings').upsert([{ key: 'upi_vpa', value: vpa }, { key: 'gym_address', value: address }]); setSaving(false); notify('Payment settings saved — QR codes on invoices are now live.'); };
  return <><div className="page-head"><div><p className="eyebrow">Owner settings</p><h1 className="title">Payment Settings</h1><p className="sub">Your UPI ID powers free QR-code payments on every invoice — no payment gateway or fees.</p></div></div>
    <div className="card" style={{maxWidth:480}}><form onSubmit={save} className="form-grid">
      <div className="field" style={{gridColumn:'1 / -1'}}><label>UPI ID (VPA)</label><input value={vpa} onChange={e=>setVpa(e.target.value)} placeholder="yourgym@okaxis" /></div>
      <div className="field" style={{gridColumn:'1 / -1'}}><label>Gym address (for invoices)</label><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Full address" /></div>
      <button className="button primary full" disabled={saving} style={{gridColumn:'1 / -1'}}>{saving?'Saving...':'Save settings'}</button>
    </form></div>
  </>;
}
