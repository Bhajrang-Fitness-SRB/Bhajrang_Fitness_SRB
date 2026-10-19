// Node module-resolution hook: map Deno-style specifiers to local stubs so the real index.ts files can run.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('npm:@supabase/supabase-js')) return { url: new URL('./stub-supabase.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('jsr:')) return { url: 'data:text/javascript,export{}', shortCircuit: true };
  return next(specifier, context);
}
