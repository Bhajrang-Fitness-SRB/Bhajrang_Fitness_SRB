import { FormEvent, useRef, useState, useCallback, useEffect } from 'react';
import jsQR from 'jsqr';
import { ArrowLeft, Zap, X, Radio } from 'lucide-react';
import { initializeFaceApi, detectFaceAndIdentify } from './lib/faceApi';

const supabase = (window as any).supabase;

const GOODBYE_LINES = [
  'Have a great workout, {name}!',
  'Strong work today, {name}!',
  'See you soon, {name}!',
  'Keep crushing it, {name}!',
  'Train hard, {name}!',
  'You got this, {name}!',
];

function speak(text: string) {
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch { /* speech not available on this device — silently skip */ }
}

/**
 * Enhanced Kiosk component with three scan modes:
 * 1. Manual ID input (always available)
 * 2. QR code scanning via camera (existing)
 * 3. Face scan detection (new, optional, lazy-loaded)
 */
export function Kiosk({onBack,notify}:{onBack:()=>void;notify:(m:string)=>void}){
  // Shared state
  const [code,setCode]=useState('');
  const [message,setMessage]=useState('');
  const [alertLevel,setAlertLevel]=useState<'ok'|'warn'|'danger'>('ok');
  const [logs,setLogs]=useState<{id:string;name:string;action:string;time:string}[]>([]);
  const [camError,setCamError]=useState('');
  
  // QR scanning state
  const [scanning,setScanning]=useState(false);
  
  // Face scanning state (new)
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceInitError, setFaceInitError] = useState('');
  const [faceLoading, setFaceLoading] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const processId = useCallback(async (rawId: string) => {
    const id = rawId.trim().toUpperCase();
    if (!id) return;
    const { data, error } = await supabase.rpc('kiosk_scan', { p_member_id: id });
    if (error || !data || !data.found) { setMessage('ACCESS DENIED · ID NOT FOUND'); setAlertLevel('danger'); notify('Warrior ID not found.'); setCode(''); return; }
    const name = data.name || data.member_id;
    const action = data.action as string;
    const isExpired = !!data.expired;

    if (action === 'CHECK-IN') {
      speak(`Welcome to Bhajrang Fitness, ${name}`);
      if (isExpired) {
        setTimeout(() => speak(`Attention. ${name}, your package has expired. Please renew at reception.`), 1600);
      }
    } else {
      speak(GOODBYE_LINES[Math.floor(Math.random()*GOODBYE_LINES.length)].replace('{name}', name));
    }

    setAlertLevel(isExpired ? 'danger' : 'ok');
    setMessage(isExpired ? `${action} · ${name} · PACKAGE EXPIRED` : `${action} · ${name}`);
    setLogs(x=>[{id:data.member_id,name,action,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})},...x].slice(0,6));
    setCode('');
  }, [notify]);

  // ===== QR SCANNING LOGIC =====
  const scan=async(e:FormEvent)=>{e.preventDefault();await processId(code);};

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current = null; }
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCamError('');
    setFaceScanning(false); // Stop face mode if active
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanning(true);
      let lastTry = 0;
      const loop = (t: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (t - lastTry < 220) return;
        lastTry = t;
        const video = videoRef.current, canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height);
        if (result && result.data) {
          stopCamera();
          processId(result.data);
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setCamError('Camera unavailable — check permissions, or type the Warrior ID below.');
    }
  }, [processId, stopCamera]);

  // ===== FACE SCANNING LOGIC (NEW) =====
  const stopFaceCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current = null; }
    setFaceScanning(false);
  }, []);

  const startFaceCamera = useCallback(async () => {
    setFaceInitError('');
    setFaceLoading(true);
    setScanning(false); // Stop QR mode if active

    try {
      // Initialize face-api.js on first use
      const initialized = await initializeFaceApi();
      if (!initialized) {
        throw new Error('Failed to load face detection models');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setFaceScanning(true);
      setFaceLoading(false);

      let lastDetection = 0;
      const loop = (t: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (t - lastDetection < 500) return; // Throttle face detection to every 500ms
        lastDetection = t;

        const video = videoRef.current, canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Run face detection
        (async () => {
          try {
            const result = await detectFaceAndIdentify(canvas);
            if (result.found) {
              setMessage(`Face detected · Confidence: ${(result.confidence || 0).toFixed(2)}`);
              setAlertLevel('ok');
              // Note: In production, if result.memberId is set, call processId(result.memberId)
              // For now, this is a detection-only implementation
            }
          } catch (err) {
            console.error('Face detection error:', err);
          }
        })();
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setFaceLoading(false);
      setFaceInitError('Face camera unavailable — check permissions, or use another method.');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopCamera(); stopFaceCamera(); }, [stopCamera, stopFaceCamera]);

  return <main className="kiosk"><div className="kiosk-inner"><div className="kiosk-head"><div style={{display:'flex',alignItems:'center',gap:18}}><span className="status-dot"><i className="dot"/> SCANNER READY</span><button className="button ghost" onClick={onBack}><ArrowLeft size={15}/> Exit</button></div></div><div className="scan-box"><p className="kicker">BHAJRANG AI KIOSK // GATE 01</p><h1 className="title">Scan to enter.</h1><p className="sub">Present your QR pass, use the camera, type your Warrior ID, or try face scan.</p>
    <div className="scan-frame" style={{overflow:'hidden',position:'relative'}}>
      {scanning || faceScanning ? <video ref={videoRef} muted playsInline style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <><div className="scan-line"/><Radio size={48} strokeWidth={1}/></>}
      <canvas ref={canvasRef} style={{display:'none'}}/>
    </div>
    
    {/* QR Scan Button */}
    <button type="button" className="button ghost" style={{width:'100%',justifyContent:'center',marginBottom:14}} onClick={()=>scanning?stopCamera():startCamera()}>
      {scanning ? <><X size={15}/> Stop camera</> : <><Zap size={15}/> Scan with camera</>}
    </button>
    {camError && <p className="error" style={{fontSize:12,marginTop:-6,marginBottom:14}}>{camError}</p>}

    {/* Face Scan Button (New) */}
    <button type="button" className="button ghost" style={{width:'100%',justifyContent:'center',marginBottom:14,borderColor:'var(--cyan)',color:'var(--cyan)'}} onClick={()=>faceScanning?stopFaceCamera():startFaceCamera()} disabled={faceLoading}>
      {faceLoading ? <>Loading face detection...</> : faceScanning ? <><X size={15}/> Stop face scan</> : <>🔍 Try face scan</>}
    </button>
    {faceInitError && <p className="error" style={{fontSize:12,marginTop:-6,marginBottom:14}}>{faceInitError}</p>}

    <form onSubmit={scan}><input autoFocus className="kiosk-input" value={code} onChange={e=>setCode(e.target.value)} placeholder="WARRIOR ID"/></form>
    {message&&<p className={alertLevel==='danger'?'error':alertLevel==='warn'?'kiosk-warn':'success'} style={{fontSize:13,letterSpacing:'.08em',marginTop:20}}>{message}</p>}
    <div className="log-list" style={{textAlign:'left'}}>{logs.length>0&&<p className="eyebrow" style={{margin:'18px 0 0'}}>Live action log</p>}{logs.map(x=><div className="log" key={x.id+x.time}><span><b>{x.name}</b> · {x.action}</span><span>{x.time}</span></div>)}</div>
  </div></div></main>
}
