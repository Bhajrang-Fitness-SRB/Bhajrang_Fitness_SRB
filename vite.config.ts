import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Branding without touching code: the app text, page title and install-icon names say
 * "Bhajrang Fitness" in the source. Set VITE_GYM_NAME (and optionally VITE_GYM_SHORT_NAME)
 * and every occurrence is replaced at build time, so one code base serves any branch or gym.
 */
function brand(env: Record<string, string>): Plugin {
  const clean = (v: string) => v.replace(/["'`\\<>${}]/g, '').trim();
  const name = clean(env.VITE_GYM_NAME || '');
  const short = clean(env.VITE_GYM_SHORT_NAME || '') || name;
  const swap = (t: string) => name
    ? t.replace(/BHAJRANG FITNESS/g, name.toUpperCase()).replace(/Bhajrang Fitness/g, name).replace(/SRB Bhajrang/g, name).replace(/\bBHAJRANG\b/g, short.toUpperCase()).replace(/\bBhajrang\b/g, short)
    : t;
  return {
    name: 'rbf-brand',
    enforce: 'pre',
    transform(code, id) { return name && /\/src\/.*\.(tsx?|css)$/.test(id) ? { code: swap(code), map: null } : null; },
    transformIndexHtml: { order: 'pre', handler: (html) => swap(html) },
    closeBundle() {
      if (!name) return;
      const out = path.resolve('dist');
      for (const f of fs.readdirSync(out)) if (f.endsWith('.webmanifest')) {
        const p = path.join(out, f); fs.writeFileSync(p, swap(fs.readFileSync(p, 'utf8')));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), brand(env)],
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Stable vendor chunks: cached across deploys, so repeat visits download only app code.
          manualChunks: {
            react: ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
            icons: ['lucide-react'],
            qr: ['qrcode.react'],
            csv: ['papaparse'],
          },
        },
      },
    },
  };
});
