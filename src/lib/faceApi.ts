/**
 * Face recognition helpers (face-api.js, @vladmandic build) for the Kiosk and staff enrolment.
 * Library + models load lazily from the CDN the first time face mode is opened.
 * Runs entirely in the browser; only 128-number descriptors are ever sent to Supabase.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FaceApi = any;

declare global {
  interface Window { faceapi?: FaceApi }
}

const VERSION = '1.7.15';
const LIB_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}/dist/face-api.js`;
const MODEL_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}/model/`;

export type FaceCandidate = { member_id: string; name: string | null; descriptor: number[] };
export type FaceMatch = { memberId: string; name: string | null; distance: number };

let loading: Promise<FaceApi> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-faceapi="1"]`);
    if (existing) {
      if (window.faceapi) { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Face library failed to load.')));
      return;
    }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.dataset.faceapi = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Face library failed to load (check internet connection).'));
    document.head.appendChild(s);
  });
}

/** Loads the library and the three models needed for recognition. Safe to call repeatedly. */
export function loadFaceApi(): Promise<FaceApi> {
  if (loading) return loading;
  loading = (async () => {
    if (!window.faceapi) await loadScript(LIB_URL);
    const fa = window.faceapi;
    if (!fa) throw new Error('Face library not available.');
    await Promise.all([
      fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return fa;
  })();
  loading.catch(() => { loading = null; }); // allow a retry after a failure
  return loading;
}

/** Returns the 128-number descriptor of the single clearest face, or null if no face / more than one face. */
export async function getDescriptor(input: HTMLVideoElement | HTMLCanvasElement): Promise<number[] | null> {
  const fa = await loadFaceApi();
  const results = await fa
    .detectAllFaces(input, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (!results || results.length !== 1) return null; // none, or ambiguous (two faces in frame)
  return Array.from(results[0].descriptor as Float32Array);
}

export function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

/** Average several descriptors into one steadier template (used during enrolment). */
export function averageDescriptors(list: number[][]): number[] {
  const out = new Array(128).fill(0);
  for (const d of list) for (let i = 0; i < 128; i++) out[i] += d[i];
  return out.map(v => v / list.length);
}

/**
 * Finds the closest enrolled face. Strict on purpose (attendance, not entertainment):
 * the best match must be under MAX_DISTANCE and clearly better than the runner-up.
 */
const MAX_DISTANCE = 0.5;
const MIN_MARGIN = 0.04;
export function matchDescriptor(desc: number[], candidates: FaceCandidate[]): FaceMatch | null {
  let best: { c: FaceCandidate; d: number } | null = null;
  let second = Infinity;
  for (const c of candidates) {
    if (!Array.isArray(c.descriptor) || c.descriptor.length !== 128) continue;
    const d = distance(desc, c.descriptor);
    if (!best || d < best.d) { if (best) second = Math.min(second, best.d); best = { c, d }; }
    else if (d < second) second = d;
  }
  if (!best || best.d > MAX_DISTANCE) return null;
  if (second - best.d < MIN_MARGIN) return null;
  return { memberId: best.c.member_id, name: best.c.name, distance: best.d };
}
