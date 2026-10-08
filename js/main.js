/* Swarm HQ SPA entry: hash router (works under /swarm-hq/ on GitHub Pages), auth gate, screen switching. */
import { esc, toast } from './util.js';
import { getBackend, MOCK } from './data/index.js';
import { appHeader, wireHeader, CONN } from './views/shell.js';
import { renderLanding } from './views/landing.js';
import { renderOfficeView } from './views/office-view.js';
import { renderSettings } from './views/settings.js';
import { create as createDemoSource } from './data/mock.js';

const app = document.getElementById('app');
let backend, user = null, cleanup = null, seq = 0, workspaces = null, authNotice = '';

function parse() {
  const h = location.hash.replace(/^#/, '');
  if (/(^|&)(access_token|error_description|error)=/.test(h)) return { name: 'auth' };
  const [path, query = ''] = h.split('?'); const parts = path.split('/').filter(Boolean).map(decodeURIComponent); const q = new URLSearchParams(query);
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'signin') return { name: 'signin' };
  if (parts[0] === 'demo') return { name: 'demo' };
  if (parts[0] === 'w' && parts[1]) {
    if (parts[2] === 'settings') return { name: 'settings', slug: parts[1], add: q.get('add') === '1' };
    if (parts[2] === 'view') return { name: 'shared', slug: parts[1], token: q.get('k') || '' };
    return { name: 'office', slug: parts[1] };
  }
  return { name: 'notfound' };
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

async function getWorkspaces(force) { if (!workspaces || force) workspaces = await backend.listWorkspaces(); return workspaces; }
function headerFor(ws, extra = {}) {
  return conn => appHeader({ user, workspaces, current: ws, isOwner: ws && ws.role === 'owner', conn, ...extra });
}
const wire = el => wireHeader(el, {
  onSignOut: async () => { await backend.signOut(); workspaces = null; toast('Signed out'); go('#/'); },
  onNewWorkspace: async () => {
    const name = prompt('Name your new workspace:', 'New office'); if (!name || !name.trim()) return;
    try { const w = await backend.createWorkspace(name.trim()); await getWorkspaces(true); go('#/w/' + encodeURIComponent(w.slug)); } catch (e) { toast(e.message, 'err'); }
  },
});

async function route() {
  const my = ++seq; const r = parse();
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  document.body.classList.remove('has-drawer');
  window.scrollTo(0, 0);
  const done = c => { if (my === seq) cleanup = c; else if (c) c(); };
  try {
    if (r.name === 'auth') { app.innerHTML = '<p class="empty loading">Signing you in…</p>'; if (/error/.test(location.hash)) { authNotice = decodeURIComponent((location.hash.match(/error_description=([^&]*)/) || [])[1] || 'Sign-in failed').replace(/\+/g, ' '); } history.replaceState(null, '', location.pathname + location.search + '#/'); return route(); }
    if (r.name === 'demo') {
      document.title = 'Swarm HQ · Demo office';
      const demo = createDemoSource();
      return done(await renderOfficeView(app, {
        headerHtml: conn => appHeader({ user: null, current: { name: 'Demo HQ', slug: 'demo' }, conn, readOnlyLabel: 'demo · fictional data', signInLink: true }), wire,
        source: { loadRows: () => demo.loadRows('ws-demo'), subscribe: h => demo.subscribe('ws-demo', h) }, connKind: 'demo', workspace: { name: 'Demo HQ', slug: 'demo' }, isOwner: false,
      }));
    }
    if (r.name === 'shared') {
      document.title = 'Swarm HQ · Shared office';
      let info = null;
      const load = async () => { const d = await backend.loadShared(r.slug, r.token); info = d.workspace; return d.rows; };
      return done(await renderOfficeView(app, {
        headerHtml: conn => appHeader({ user, current: info || { name: r.slug, slug: r.slug }, conn, readOnlyLabel: 'read-only link', signInLink: !user }), wire,
        source: { loadRows: load, pollMs: 15000 }, connKind: 'shared', workspace: { name: r.slug, slug: r.slug }, isOwner: false,
      }));
    }
    if (r.name === 'home' || r.name === 'signin' || r.name === 'notfound') {
      if (user && r.name !== 'signin') { const w = await getWorkspaces(); const first = w[0] || await backend.ensureWorkspace(); if (!w.length) await getWorkspaces(true); return go('#/w/' + encodeURIComponent(first.slug)); }
      if (user && r.name === 'signin') return go('#/');
      document.title = 'Swarm HQ · See your AI bots at work';
      const n = authNotice; authNotice = '';
      return done(await renderLanding(app, { backend, focusSignIn: r.name === 'signin', notice: n }));
    }
    // Signed-in screens
    if (!user) { authNotice = ''; return go('#/signin'); }
    const list = await getWorkspaces();
    if (!list.length) { const w = await backend.ensureWorkspace(); await getWorkspaces(true); return go('#/w/' + encodeURIComponent(w.slug)); }
    const ws = list.find(w => w.slug === r.slug);
    if (!ws) { app.innerHTML = '<div class="wrap">' + headerFor(null)() + '<div class="panel card errbox"><h3>Workspace not found</h3><p class="hint">“' + esc(r.slug) + '” doesn\'t exist or you don\'t have access. Ask the owner to invite <b>' + esc(user.email) + '</b>.</p><p><a class="btn" href="#/">Go to my office</a></p></div></div>'; return done(wire(app)); }
    if (r.name === 'settings') {
      if (ws.role !== 'owner') return go('#/w/' + encodeURIComponent(ws.slug));
      document.title = 'Swarm HQ · Settings · ' + ws.name;
      return done(await renderSettings(app, { backend, workspace: ws, headerHtml: () => headerFor(ws, { settingsActive: true })(null), wire, openAdd: r.add, onDeleted: async () => { await getWorkspaces(true); go('#/'); } }));
    }
    document.title = 'Swarm HQ · ' + ws.name;
    return done(await renderOfficeView(app, {
      headerHtml: headerFor(ws), wire, source: { loadRows: () => backend.loadRows(ws.id), subscribe: h => backend.subscribe(ws.id, h) },
      connKind: MOCK ? 'mock' : 'live', workspace: ws, isOwner: ws.role === 'owner', backend,
    }));
  } catch (e) {
    console.warn('route failed', e);
    if (my === seq) app.innerHTML = '<div class="wrap"><div class="panel card errbox"><h3>Something went wrong</h3><p class="hint">' + esc(e.message || e) + '</p><p><a class="btn" href="#/">Back to start</a></p></div></div>';
  }
}

async function boot() {
  if (MOCK) {
    const bar = document.getElementById('mockbar'); bar.hidden = false;
    bar.innerHTML = '<b>MOCK MODE</b> · fictional data, simulated updates, nothing is saved' + (new URLSearchParams(location.search).get('mock') === '1' ? ' · forced by <code>?mock=1</code>' : ' · Supabase not configured yet');
  }
  backend = await getBackend();
  user = await backend.getUser();
  backend.onAuth(u => { const was = user && user.id; user = u; workspaces = null; if ((u && u.id) !== was) route(); });
  addEventListener('hashchange', route);
  route();
}
boot().catch(e => { console.warn(e); app.innerHTML = '<div class="wrap"><div class="panel card errbox"><h3>Swarm HQ couldn\'t start</h3><p class="hint">' + esc(e.message || e) + '</p><p><a class="btn" href="?mock=1#/">Open in mock mode</a></p></div></div>'; });
export { CONN };
