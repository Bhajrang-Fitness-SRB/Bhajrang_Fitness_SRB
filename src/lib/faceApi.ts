/**
 * face-api.js utility for Kiosk face scan mode.
 * Loads models from CDN, detects faces in canvas, returns member stub.
 * 
 * Independent of QR/manual input modes.
 */

declare global {
  interface Window {
    faceapi?: typeof import('face-api.js');
  }
}

export type FaceDetectionResult = {
  found: boolean;
  memberId?: string;
  confidence?: number;
  detectionBox?: { x: number; y: number; width: number; height: number };
};

let faceApiReady = false;
let faceApiError: string | null = null;

/**
 * Load face-api.js models from CDN on first call.
 * Safe to call multiple times — resolves immediately after first load.
 */
export async function initializeFaceApi(): Promise<boolean> {
  if (faceApiReady) return true;
  if (faceApiError) return false;

  try {
    // Load face-api.js from CDN if not already loaded
    if (!window.faceapi) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/face-api.js/dist/face-api.min.js';
      script.async = true;
      script.onload = () => {
        console.log('✓ face-api.js loaded from CDN');
      };
      script.onerror = () => {
        throw new Error('Failed to load face-api.js from CDN');
      };
      document.head.appendChild(script);
      
      // Wait for actual window.faceapi availability
      await new Promise<void>((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (window.faceapi) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('face-api.js load timeout'));
        }, 10000);
      });
    }

    // Load tiny_face_detector model
    if (window.faceapi) {
      await window.faceapi.nets.tinyFaceDetector.loadFromUri(
        'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'
      );
      faceApiReady = true;
      console.log('✓ Face detection models loaded');
      return true;
    }
  } catch (err) {
    faceApiError = (err as Error).message;
    console.error('❌ Face API init failed:', faceApiError);
    return false;
  }

  return false;
}

/**
 * Detect faces in a canvas and return member stub.
 * 
 * Currently returns a mock result. In production, you'd:
 * 1. Extract face descriptor from detection
 * 2. Compare with stored member face embeddings in Supabase
 * 3. Return matched member_id if confidence > threshold
 */
export async function detectFaceAndIdentify(
  canvas: HTMLCanvasElement
): Promise<FaceDetectionResult> {
  if (!faceApiReady || !window.faceapi) {
    return { found: false };
  }

  try {
    const detections = await window.faceapi.detectAllFaces(
      canvas,
      new window.faceapi.TinyFaceDetectorOptions()
    );

    if (!detections || detections.length === 0) {
      return { found: false };
    }

    // For now: return first face detection as mock (no member matching)
    // In production: extract descriptor, query Supabase for face_embedding match
    const face = detections[0];
    const box = face.detection.box;

    return {
      found: true,
      confidence: face.detection.score,
      detectionBox: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
      // Mock: would be replaced with actual member lookup
      memberId: undefined,
    };
  } catch (err) {
    console.error('❌ Face detection failed:', err);
    return { found: false };
  }
}

export function getFaceApiError(): string | null {
  return faceApiError;
}
