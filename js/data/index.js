/* Single entry point for all data access. Picks MOCK or SUPABASE mode from config.js / ?mock=1.
   Every screen talks only to the object returned by getBackend(); see BACKEND.md for the server contract. */
const CFG = window.SWARM_CONFIG || {};
const qs = new URLSearchParams(location.search);
export const MOCK = qs.get('mock') === '1' || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
export const CONFIG = CFG;
export function siteUrl() { return CFG.SITE_URL || (location.origin + location.pathname); }
export function reportUrl() {
  return CFG.SUPABASE_URL ? CFG.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/report' : 'https://<project>.supabase.co/functions/v1/report';
}
/** OAuth buttons are HIDDEN unless their flag is true in config.js (`oauth: { google, github }`). */
export function providers() { const p = CFG.oauth || CFG.AUTH_PROVIDERS || {}; return { google: p.google === true, github: p.github === true }; }

let backendP = null;
export function getBackend() {
  if (!backendP) backendP = (MOCK ? import('./mock.js') : import('./supabase.js')).then(m => m.create(CFG));
  return backendP;
}
