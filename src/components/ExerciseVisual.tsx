import { useEffect, useState } from 'react';
import { Dumbbell, PlayCircle } from 'lucide-react';

const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
const RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

/** Library images come as two frames (start / end): …/0.jpg and …/1.jpg. */
const frames = (url: string): string[] | null => {
  const m = url.match(/\/exercises\/([^/]+)\/0\.jpg$/);
  return m ? [CDN + m[1] + '/0.jpg', CDN + m[1] + '/1.jpg'] : null;
};

/** Start/end frames flip like a short animation; other URLs (GIF/photo) show as they are. */
export function ExerciseVisual({ url, name, size, animate = true, contain = false }: { url: string | null; name: string; size?: number; animate?: boolean; contain?: boolean }) {
  const lib = url ? frames(url) : null;
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  const [useRaw, setUseRaw] = useState(false);
  useEffect(() => {
    if (!lib || !animate || failed) return;
    const t = setInterval(() => setI(n => (n + 1) % 2), 900);
    return () => clearInterval(t);
  }, [lib, animate, failed]);

  const box: React.CSSProperties = size
    ? { width: size, height: size, borderRadius: 10, flexShrink: 0 }
    : { width: '100%', maxHeight: 360, display: 'block', margin: '0 auto' };
  const fit: React.CSSProperties = { objectFit: contain ? 'contain' : 'cover', background: '#fff' };

  if (!url || failed) {
    return <div style={{ ...(size ? box : { height: 200 }), background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Dumbbell size={size ? Math.round(size / 3) : 40} style={{ opacity: 0.4 }} /></div>;
  }
  let src = url;
  if (lib) { src = lib[animate ? i : 0]; if (useRaw) src = src.replace(CDN, RAW); }
  return <img src={src} alt={name} loading="lazy" style={{ ...box, ...fit }}
    onError={() => { if (lib && !useRaw) setUseRaw(true); else setFailed(true); }} />;
}

/** Always-available visual guide: opens a video search for this exercise. */
export function VideoGuideLink({ name }: { name: string }) {
  const q = encodeURIComponent(`${name} exercise proper form`);
  return <a className="button ghost" style={{ justifyContent: 'center', width: '100%' }} href={`https://www.youtube.com/results?search_query=${q}`} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Watch video guide</a>;
}
