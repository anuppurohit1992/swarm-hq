/* Swarm HQ SPA entry: hash router (works under /swarm-hq/ on GitHub Pages), auth gate, screen switching. */
import { esc, toast } from './util.js';
import { getBackend, MOCK } from './data/index.js';
import { appHeader, wireHeader, CONN } from './views/shell.js';
import { renderLanding } from './views/landing.js';
import { renderOfficeView } from './views/office-view.js';
import { renderSettings } from './views/settings.js';
import { create as createDemoSource } from './data/mock.js';

const app = document.getElementById('app');
let backend, user = null, cleanup = null, seq = 0, workspaces = null, authNotice = '', justDeleted = '';

function parse() {
  const h = location.hash.replace(/^#/, '');
  if (/(^|&)(access_token|error_description|error)=/.test(h)) return { name: 'auth' };
  const sh = /^share=([A-Za-z0-9]+)/.exec(h); if (sh) return { name: 'shared', slug: '', token: sh[1] }; // README alias: #share=<token>
  const [path, query = ''] = h.split('?'); const parts = path.split('/').filter(Boolean).map(decodeURIComponent); const q = new URLSearchParams(query);
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'signin') return { name: 'signin' };
  if (parts[0] === 'demo') return { name: 'demo' };
  if (parts[0] === 'start') return { name: 'start' };
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
  onNewWorkspace: () => go('#/start'),
});

/** No-workspaces screen (first sign-in, or after deleting your last workspace). Creates a workspace ONLY on submit. */
function renderStart(list) {
  const del = justDeleted; justDeleted = '';
  const none = !list.length;
  const title = del && none ? 'No workspaces yet' : none ? 'Welcome! Name your office' : 'Create a workspace';
  const lead = del ? '“' + esc(del) + '” was deleted. ' + (none ? 'You don\'t have any workspaces now. Create one to get going again.' : 'Create another one, or open one of your other workspaces.')
    : none ? 'You don\'t have a workspace yet. Name your office to get eight empty desks for your bots. If someone invited you, ask them to invite <b>' + esc(user.email) + '</b>, then sign in again.'
    : 'Each workspace has its own bots, keys, members and share link.';
  app.innerHTML = '<div class="wrap">' + headerFor(null)() + '<div class="panel card startbox" id="startbox"><h2 class="pt">' + title + '</h2><p class="hint">' + lead + '</p>' +
    '<form id="newws" class="newws" novalidate><label class="fld"><span>Workspace name</span><input id="wsname" name="wsname" maxlength="60" autocomplete="off" value="My office" required></label>' +
    '<button class="btn pri" type="submit" id="createws">Create workspace</button></form><p class="hint">The address gets a short random suffix, e.g. <span class="mono">my-office-x7k2</span>. You can rename the workspace later in Settings.</p>' +
    (none ? '' : '<p><a class="btn" href="#/w/' + encodeURIComponent(list[0].slug) + '">Back to ' + esc(list[0].name) + '</a></p>') + '</div></div>';
  const unwire = wire(app);
  const f = app.querySelector('#newws'), inp = app.querySelector('#wsname'), btn = app.querySelector('#createws');
  f.addEventListener('submit', async e => {
    e.preventDefault(); const name = inp.value.trim(); if (!name) { inp.focus(); toast('Enter a workspace name', 'err'); return; }
    btn.disabled = true; btn.textContent = 'Creating…';
    try { const w = await backend.createWorkspace(name); await getWorkspaces(true); toast('Created ' + w.name); go('#/w/' + encodeURIComponent(w.slug)); }
    catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Create workspace'; }
  });
  return () => { unwire && unwire(); };
}

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
      // Fetch the snapshot first so the header shows the workspace NAME from get_shared_workspace (slug only as a fallback).
      let first = null, firstErr = null, info = null;
      app.innerHTML = '<div class="wrap"><p class="empty loading">Loading office…</p></div>';
      try { const d = await backend.loadShared(r.slug, r.token); info = d.workspace || null; first = d.rows; } catch (e) { firstErr = e; }
      if (my !== seq) return;
      const shown = { name: (info && (info.name || info.slug)) || r.slug || 'Shared office', slug: (info && info.slug) || r.slug };
      if (info) document.title = 'Swarm HQ · ' + shown.name + ' (read-only)';
      const load = async () => {
        if (firstErr) { const e = firstErr; firstErr = null; throw e; }
        if (first) { const x = first; first = null; return x; }
        return (await backend.loadShared(r.slug, r.token)).rows;
      };
      return done(await renderOfficeView(app, {
        headerHtml: conn => appHeader({ user, current: shown, conn, readOnlyLabel: 'read-only link', signInLink: !user }), wire,
        source: { loadRows: load, pollMs: 15000 }, connKind: 'shared', workspace: shown, isOwner: false,
      }));
    }
    if (r.name === 'home' || r.name === 'signin' || r.name === 'notfound') {
      if (user && r.name !== 'signin') { const w = await getWorkspaces(); return go(w.length ? '#/w/' + encodeURIComponent(w[0].slug) : '#/start'); }
      if (user && r.name === 'signin') return go('#/');
      document.title = 'Swarm HQ · See your AI bots at work';
      const n = authNotice; authNotice = '';
      return done(await renderLanding(app, { backend, focusSignIn: r.name === 'signin', notice: n }));
    }
    // Signed-in screens
    if (!user) { authNotice = ''; return go('#/signin'); }
    const list = await getWorkspaces();
    if (r.name === 'start') { document.title = 'Swarm HQ · Create a workspace'; return done(renderStart(list)); }
    if (!list.length) return go('#/start'); // never auto-create: the user creates a workspace explicitly
    const ws = list.find(w => w.slug === r.slug);
    if (!ws) { app.innerHTML = '<div class="wrap">' + headerFor(null)() + '<div class="panel card errbox"><h3>Workspace not found</h3><p class="hint">“' + esc(r.slug) + '” doesn\'t exist or you don\'t have access. Ask the owner to invite <b>' + esc(user.email) + '</b>.</p><p><a class="btn" href="#/">Go to my office</a></p></div></div>'; return done(wire(app)); }
    if (r.name === 'settings') {
      if (ws.role !== 'owner') return go('#/w/' + encodeURIComponent(ws.slug));
      document.title = 'Swarm HQ · Settings · ' + ws.name;
      return done(await renderSettings(app, { backend, workspace: ws, headerHtml: () => headerFor(ws, { settingsActive: true })(null), wire, openAdd: r.add, onDeleted: async () => { justDeleted = ws.name; await getWorkspaces(true); go('#/'); } }));
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
  if (user) await backend.acceptInvites(); // after every sign-in / app load
  backend.onAuth(async u => { const was = user && user.id; user = u; workspaces = null; if ((u && u.id) !== was) { if (u) await backend.acceptInvites(); route(); } });
  addEventListener('hashchange', route);
  route();
}
boot().catch(e => { console.warn(e); app.innerHTML = '<div class="wrap"><div class="panel card errbox"><h3>Swarm HQ couldn\'t start</h3><p class="hint">' + esc(e.message || e) + '</p><p><a class="btn" href="?mock=1#/">Open in mock mode</a></p></div></div>'; });
export { CONN };
