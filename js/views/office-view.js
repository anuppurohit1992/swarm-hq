/* Office screen (mockups 02/03/04/04b) + empty-office onboarding (06). Also used read-only for #/demo and share links. */
import { esc, TZ_LABEL, dateTime } from '../util.js';
import { createOffice } from '../office.js';
import { WorkspaceRows } from '../data/model.js';
import { CONN, setPills } from './shell.js';
import { drawerMarkup, createDrawer } from './drawer.js';
import { reportUrl } from '../data/index.js';
import { openCreateBot } from './dialogs.js';

function stageMarkup() {
  return '<div class="stage" id="stage"><canvas id="cv" aria-hidden="true"></canvas><div id="ov"></div><div class="bub msg" id="mbub" hidden aria-hidden="true"></div><div class="bub" id="hbub" hidden role="status"></div></div>';
}
function bodyMarkup(empty, o) {
  const office = '<section class="panel office" aria-label="Office floor">' + stageMarkup() + '<p class="legend" id="legend"></p></section>' +
    '<section class="panel" aria-labelledby="h-log"><div class="ph"><h2 id="h-log">Comms log</h2><span class="sub" id="logn"></span></div><ol id="log"></ol></section>';
  if (!empty) {
    return '<section class="panel hud" id="hud" aria-label="Summary"></section><div class="grid"><div class="main">' + office + '</div>' +
      '<aside class="panel side" aria-labelledby="h-q"><div class="ph"><h2 id="h-q">Missions</h2><button class="btn" id="reset" type="button">Show all</button></div><p class="sel" id="sel" aria-live="polite"></p><div id="quests"></div></aside></div>' +
      '<footer>Overall progress = average of every task\'s progress %. Active bots = activity other than idle. Times in ' + esc(TZ_LABEL) + '. Select a desk to open its details.</footer>';
  }
  const ws = o.workspace || {};
  const aside = o.isOwner
    ? '<aside class="panel side onb" aria-labelledby="h-gs"><div class="ph"><h2 id="h-gs">Get started</h2><span class="mono prog">1 of 3 done</span></div><ol class="ob">' +
      '<li class="done"><span class="n mono">✓</span><div><b>Name your workspace</b><p>Done: “' + esc(ws.name) + '”. You can rename it in Settings.</p></div></li>' +
      '<li class="cur"><span class="n mono">2</span><div><b>Add your first bot</b><p>Pick a name, role and emoji. The bot gets its own API key, shown once with a Copy button.</p><button class="btn pri big" type="button" id="addfirst">+ Add your first bot</button></div></li>' +
      '<li><span class="n mono">3</span><div><b>Send its first report</b><p>One HTTPS call reports activity, tasks and messages. The desk lights up within seconds.</p><pre class="code mini"><code><span class="c-cmd">POST</span> <span class="c-url">' + esc(reportUrl().replace(/^https:\/\/[^/]+/, '')) + '</span>\n<span class="c-key">x-api-key</span>: $BOT_KEY\n<span class="c-key">Content-Type</span>: application/json</code></pre><p class="hint">Use that bot\'s own key. Full curl, Python and JS snippets are in <a href="#/w/' + encodeURIComponent(ws.slug) + '/settings">Settings → Report snippet</a>.</p></div></li></ol></aside>'
    : '<aside class="panel side onb" aria-labelledby="h-gs"><div class="ph"><h2 id="h-gs">Nothing here yet</h2></div><p class="empty">The owner hasn\'t connected any bots yet. Desks appear here as soon as one reports in.</p></aside>';
  // No bots but tasks exist (e.g. every bot removed → Unassigned tasks): keep the onboarding AND show the Missions panel.
  const missions = o.hasTasks ? '<aside class="panel side" aria-labelledby="h-q"><div class="ph"><h2 id="h-q">Missions</h2><button class="btn" id="reset" type="button">Show all</button></div><p class="sel" id="sel" aria-live="polite"></p><div id="quests"></div></aside>' : '';
  const side = missions ? '<div class="sidecol">' + aside + missions + '</div>' : aside;
  return '<section class="panel hud" id="hud" aria-label="Summary"></section><div class="welcome"><h2 class="pt">' + (o.isOwner ? 'Your office is ready <span aria-hidden="true">👋</span>' : esc(ws.name) + ' is empty') + '</h2><p class="sub">Eight empty desks and a coffee machine. Connect a bot and it takes a desk here.</p></div>' +
    '<div class="grid"><div class="main">' + office + '</div>' + side + '</div><footer>Times in ' + esc(TZ_LABEL) + '. Desks appear as bots connect; the office grows to fit any number of bots.</footer>';
}

/**
 * el: container. opts: { headerHtml(conn), wire(el)->cleanup, source:{loadRows, subscribe}, connKind: 'live'|'mock'|'demo'|'shared', workspace, isOwner }
 */
export async function renderOfficeView(el, opts) {
  let conn = CONN.connecting, state = 'connecting', office = null, drawer = null, empty = null, hasTasks = false, unsub = null, unwire = null, dead = false, pollT = 0;
  el.innerHTML = '<div class="wrap">' + opts.headerHtml(conn) + '<div id="obody"><p class="empty loading">Loading office…</p></div></div>';
  unwire = opts.wire ? opts.wire(el) : null;
  const body = el.querySelector('#obody');
  let rows;
  try { rows = new WorkspaceRows(await opts.source.loadRows()); }
  catch (e) { body.innerHTML = '<div class="panel card errbox"><h3>Couldn\'t open this office</h3><p class="hint">' + esc(e.message) + '</p><p><a class="btn" href="#/">Back to start</a></p></div>'; setPills(el, CONN.error); return () => { unwire && unwire(); }; }
  if (dead) return () => {};

  function connObj() {
    const base = { ...CONN[state] }; const st = rows.status();
    if (state === 'connected' || state === 'mock' || state === 'demo' || state === 'shared') base.sub = st.bots.length ? (st.updated ? 'Last report ' + dateTime(st.updated) : 'No reports yet') : 'Waiting for the first bot report';
    if (state === 'connected' && !st.bots.length) base.state = 'warn';
    if (state === 'offline' || state === 'reconnecting') base.sub = st.updated ? 'Last report ' + dateTime(st.updated) : '';
    if (state === 'mock') base.sub = 'Fictional data · nothing is saved';
    return base;
  }
  function build() {
    const st = rows.status(); empty = st.bots.length === 0; hasTasks = st.tasks.length > 0;
    if (office) office.destroy(); if (drawer) drawer.destroy();
    body.innerHTML = bodyMarkup(empty, { ...opts, hasTasks }) + (empty ? '' : drawerMarkup());
    office = createOffice(body, {
      data: st, live: connObj(), vacant: 8, emptyLegend: 'No bots yet · 8 open desks', emptySign: empty ? 'No bots yet · desks are ready' : '',
      onDesk: id => { office.select(id); drawer.open(id, office.deskEl(id)); },
      onLayout: () => drawer && drawer.placeSpot(),
    });
    drawer = empty ? null : createDrawer(body, office, {});
    const add = body.querySelector('#addfirst');
    if (add && opts.backend) add.addEventListener('click', () => openCreateBot({ backend: opts.backend, wsId: opts.workspace.id, first: true,
      onCreated: r => { rows.apply({ table: 'bots', eventType: 'INSERT', new: { ...r.bot, workspace_id: opts.workspace.id, activity: 'idle', doing: '', last_heartbeat: null, created_at: new Date().toISOString() } }); refresh(); } }));
  }
  function refresh() {
    if (dead) return; const st = rows.status();
    if ((st.bots.length === 0) !== empty || (empty && (st.tasks.length > 0) !== hasTasks)) { build(); return; }
    office.setData(st); office.setConn(connObj()); if (drawer && drawer.id) drawer.render();
  }
  build(); setPills(el, conn);
  function setState(s) {
    if (opts.connKind === 'mock' && (s === 'connected' || s === 'mock')) s = 'mock';
    if (opts.connKind === 'demo') s = 'demo';
    if (opts.connKind === 'shared') s = 'shared';
    state = s; conn = connObj(); if (office) office.setConn(conn); setPills(el, conn);
  }
  let pend = 0;
  const onEvent = evt => { if (rows.apply(evt) && !pend) pend = requestAnimationFrame(() => { pend = 0; refresh(); }); };
  const onResync = async () => { try { rows.set(await opts.source.loadRows()); refresh(); } catch (e) { console.warn('resync failed', e); } };
  if (opts.source.subscribe) unsub = opts.source.subscribe({ onEvent, onStatus: setState, onResync });
  else setState('shared');
  if (opts.source.pollMs) pollT = setInterval(onResync, opts.source.pollMs);
  const hbTick = setInterval(() => { if (office) office.setConn(connObj()); }, 30000);
  return () => { dead = true; clearInterval(pollT); clearInterval(hbTick); unsub && unsub(); unwire && unwire(); office && office.destroy(); drawer && drawer.destroy(); };
}
