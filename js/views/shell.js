/* App header (brand, workspace switcher, LIVE pill, settings, account menu) and connection-state labels. */
import { esc, ICON } from '../util.js';

export const CONN = {
  connecting: { state: 'warn', label: 'CONNECTING', text: 'Connecting to realtime…' },
  connected: { state: 'ok', label: 'LIVE', text: 'Connected · realtime' },
  reconnecting: { state: 'warn', label: 'RECONNECTING', text: 'Reconnecting · updates paused' },
  offline: { state: 'off', label: 'OFFLINE', text: 'Offline · showing last known data' },
  mock: { state: 'mock', label: 'MOCK', text: 'Mock mode · simulated updates' },
  demo: { state: 'mock', label: 'DEMO', text: 'Demo office · fictional data' },
  shared: { state: 'ok', label: 'READ-ONLY', text: 'Shared link · refreshes every 15s' },
  error: { state: 'off', label: 'ERROR', text: 'Could not load this office' },
};
export function pill(c, extra = '') { return '<span class="livepill ' + esc(c.state) + ' ' + extra + '" data-conn-pill><i class="pulse"></i>' + esc(c.label) + '</span>'; }

/**
 * opts: { user, workspaces, current, isOwner, conn, readOnlyLabel, onSignOut, onNewWorkspace, settingsActive, signInLink }
 */
export function appHeader(opts) {
  const cur = opts.current;
  const initial = opts.user ? (opts.user.name || opts.user.email || '?').trim()[0].toUpperCase() : '';
  const wsBtn = cur ? '<div class="menuwrap"><button class="ws" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="wsmenu" aria-label="Switch workspace"><span class="wsn">' + esc(cur.name) + '</span>' + (opts.workspaces ? '<span class="caret" aria-hidden="true">▾</span>' : '') + '</button>' +
    (opts.workspaces ? '<div class="menu" id="wsmenu" role="menu" hidden>' + opts.workspaces.map(w => '<a role="menuitem" href="#/w/' + encodeURIComponent(w.slug) + '"' + (w.id === cur.id ? ' aria-current="true"' : '') + '><span>' + esc(w.name) + '</span><span class="mr">' + esc(w.role) + '</span></a>').join('') +
      '<button role="menuitem" type="button" data-act="new-ws">+ New workspace</button></div>' : '') + '</div>' : '';
  return '<header class="top app"><div class="brand"><a class="logo" href="#/" aria-label="Swarm HQ home">🏢</a><h1 class="bt">Swarm HQ</h1>' + (cur ? '<span class="sep" aria-hidden="true"></span>' + wsBtn : '') + (opts.readOnlyLabel ? '<span class="exd ro">' + esc(opts.readOnlyLabel) + '</span>' : '') + '</div>' +
    '<div class="tools">' + (opts.conn ? pill(opts.conn, 'mob') : '') +
    (opts.isOwner && cur ? '<a class="icon' + (opts.settingsActive ? ' on' : '') + '" href="#/w/' + encodeURIComponent(cur.slug) + '/settings" aria-label="Settings" title="Settings">' + ICON.gear + '</a>' : '') +
    (opts.user ? '<div class="menuwrap"><button class="me" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="memenu" aria-label="Account menu"><span class="ava">' + esc(initial) + '</span><span class="caret" aria-hidden="true">▾</span></button>' +
      '<div class="menu right" id="memenu" role="menu" hidden><p class="mh">Signed in as<br><b>' + esc(opts.user.email || '') + '</b></p><button role="menuitem" type="button" data-act="signout">Sign out</button></div></div>'
      : (opts.signInLink ? '<a class="btn" href="#/signin">Sign in</a>' : '')) + '</div></header>';
}

/** Wire dropdown menus + header actions inside `root`. Returns cleanup. */
export function wireHeader(root, { onSignOut, onNewWorkspace } = {}) {
  function closeAll(except) { root.querySelectorAll('[data-menu]').forEach(b => { if (b !== except) { b.setAttribute('aria-expanded', 'false'); const m = root.querySelector('#' + b.dataset.menu); if (m) m.hidden = true; } }); }
  const onClick = e => {
    const b = e.target.closest('[data-menu]');
    if (b && root.contains(b)) { const m = root.querySelector('#' + b.dataset.menu); const open = m.hidden; closeAll(b); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); e.stopPropagation(); return; }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'signout') { closeAll(); onSignOut && onSignOut(); return; }
    if (a && a.dataset.act === 'new-ws') { closeAll(); onNewWorkspace && onNewWorkspace(); return; }
    if (!e.target.closest('.menu')) closeAll();
    else if (e.target.closest('a')) closeAll();
  };
  const onKey = e => { if (e.key === 'Escape') closeAll(); };
  document.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
}

export function setPills(root, c) {
  root.querySelectorAll('[data-conn-pill]').forEach(p => { p.className = 'livepill ' + c.state + (p.classList.contains('mob') ? ' mob' : ''); p.innerHTML = '<i class="pulse"></i>' + esc(c.label); });
}
