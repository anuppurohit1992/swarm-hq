/* Pixel-office engine. ES-module port of the approved dashboard renderer (template.html / proposal office.js)
   that can be re-fed with live data. Data shape = status.json:
   {updated, bots:[{id,name,role,emoji,activity,doing,last_heartbeat}], missions:[{id,name,tasks:[taskId]}],
    tasks:[{id,title,owner,helpers,status,progress,due,note}], messages:[{id?,time,from,to,text}]}
   Markup it expects inside `root` (any missing element is ignored):
   #hud #stage>#cv,#ov,#mbub,#hbub  #legend  #log #logn  #quests #sel #reset */
import { str, esc, hash, ACTS, TZ_LABEL, hhmm as hhmmTs, fmt, todayLocal, dateTime } from './util.js';

function arr(x) { return Array.isArray(x) ? x.filter(v => v && typeof v === 'object') : []; }
function human(s) { s = str(s).replace(/[_-]+/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function cmpId(a, b) { const x = a.uuid || a.id, y = b.uuid || b.id; return x < y ? -1 : x > y ? 1 : 0; }
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
const TS = { done: ['Done', 'ok'], in_progress: ['In progress', 'run'], waiting: ['Waiting', 'wait'], blocked: ['Blocked', 'bad'], idle: ['Idle', 'mute'], unknown: ['No status', 'mute'] };
export function tst(s) { return TS[s] || [human(s) || 'Unknown', 'mute']; }
export function isDone(t) { return t.status === 'done'; }
export function involves(t, id) { return t.owner === id || t.helpers.indexOf(id) >= 0; }
function avg(l) { return l.length ? Math.round(l.reduce((a, t) => a + t.progress, 0) / l.length) : 0; }
function addDay(y, n) { const d = new Date(y + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function dueInfo(t) {
  if (!t.due) return null;
  const today = todayLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due) || isNaN(Date.parse(t.due + 'T00:00:00Z'))) return { txt: 'Due ' + t.due, c: '' };
  const o = { day: 'numeric', month: 'short', timeZone: 'UTC' }; if (t.due.slice(0, 4) !== today.slice(0, 4)) o.year = 'numeric';
  const l = new Date(t.due + 'T00:00:00Z').toLocaleDateString('en-GB', o);
  if (isDone(t)) return { txt: 'Due ' + l, c: '' };
  if (t.due < today) return { txt: 'Overdue · was due ' + l, c: 'late' };
  if (t.due === today) return { txt: 'Due today', c: 'soon' };
  if (t.due === addDay(today, 1)) return { txt: 'Due tomorrow', c: 'soon' };
  return { txt: 'Due ' + l, c: '' };
}

/** Normalise a status.json-shaped object into the engine model. */
export function model(D) {
  D = D || {};
  const bots = arr(D.bots).map((b, i) => {
    const a = str(b.activity).trim().toLowerCase();
    const revoked = !!b.revoked; // revoked key: desk dimmed, idle sprite, "Key revoked" badge
    return { id: str(b.id) || 'bot-' + i, name: str(b.name) || str(b.id) || 'Unnamed bot', role: str(b.role), emoji: str(b.emoji) || '🤖',
      act: revoked ? 'idle' : (ACTS[a] ? a : 'idle'), reported: ACTS[a] ? a : 'idle', revoked, doing: revoked ? '' : str(b.doing).trim(), hb: str(b.last_heartbeat), keyPrefix: str(b.key_prefix), uuid: str(b.uuid),
      team: str(b.team).trim().replace(/\s+/g, ' ').slice(0, 40), cts: Date.parse(str(b.created_at)), i };
  });
  // Stable desk order: created_at, then id (rows without created_at, e.g. the share snapshot, keep the server's created_at order).
  bots.sort((a, b) => (isFinite(a.cts) && isFinite(b.cts) ? (a.cts - b.cts) || cmpId(a, b) : a.i - b.i));
  bots.forEach((b, k) => { b.ord = k; });
  const BY = {}; bots.forEach(b => { BY[b.id] = b; });
  const chief = bots.find(b => !b.revoked && /chief of staff|coordinator/i.test(b.role)) || null;
  const chiefLabel = chief && /chief of staff/i.test(chief.role) ? 'Chief of Staff' : 'Coordinator';
  const tasks = arr(D.tasks).map((t, i) => {
    const st = str(t.status).trim().toLowerCase().replace(/[\s-]+/g, '_') || 'unknown'; let p = Number(t.progress);
    if (t.progress == null || t.progress === '' || !isFinite(p)) p = st === 'done' ? 100 : 0;
    if (st === 'done') p = 100; // a done task always shows 100% (bars, drawer, missions, overall)
    const o = str(t.owner);
    return { id: str(t.id) || 'task-' + i, title: str(t.title) || str(t.id) || 'Untitled task', owner: o, status: st, progress: Math.round(Math.max(0, Math.min(100, p))),
      due: str(t.due).trim().slice(0, 10), note: str(t.note).trim(),
      helpers: Array.isArray(t.helpers) ? t.helpers.map(str).filter((h, j, a) => h && h !== o && a.indexOf(h) === j) : [] };
  });
  const TB = {}; tasks.forEach(t => { TB[t.id] = t; });
  const missions = arr(D.missions).map((m, i) => {
    const ids = Array.isArray(m.tasks) ? m.tasks.map(str) : [];
    return { id: str(m.id) || 'm' + i, name: str(m.name) || str(m.id) || 'Untitled mission', tasks: ids.filter((id, j, a) => TB[id] && a.indexOf(id) === j).map(id => TB[id]) };
  });
  const inM = {}; missions.forEach(m => m.tasks.forEach(t => { inM[t.id] = 1; }));
  const other = tasks.filter(t => !inM[t.id]);
  if (other.length) missions.push({ id: '__other', name: 'Other', tasks: other, other: 1 });
  const all = arr(D.messages).map((m, i) => ({ i, key: str(m.id) || (str(m.time) + '|' + i), ts: Date.parse(str(m.time)), time: str(m.time), from: str(m.from), to: str(m.to), text: str(m.text).trim() }));
  const msgs = all.filter(m => BY[m.from] && BY[m.to] && m.from !== m.to);
  msgs.sort((a, b) => { const x = isNaN(a.ts) ? Infinity : a.ts, y = isNaN(b.ts) ? Infinity : b.ts; return x === y ? a.i - b.i : x < y ? -1 : 1; });
  return { bots, BY, chief, chiefLabel, tasks, missions, msgs, skipped: all.length - msgs.length, updated: str(D.updated) };
}

const P = { fl: ['#262b42', '#2a304a'], wall: '#343a5c', trim: '#222640', base: '#1a1d30', win: '#141e45', winHi: '#1c2c66', star: '#dfe6ff', frame: '#596089', desk: '#8b5e3c', deskHi: '#a8744b', deskFr: '#5c3b22', bez: '#14161f', off: '#0a0c15', chair: '#47508a', chairHi: '#5a64a3', chairD: '#2a3054', rug: '#3a2f62', rugB: '#5d4c96', sh: 'rgba(0,0,0,.3)', z: '#dfe6ff', lamp: 'rgba(255,214,140,.07)' };
const HAIR = ['#2b1d14', '#5a3825', '#d8a65e', '#141414', '#8b4a2b', '#b9bccb', '#6b2f5f'], SKIN = ['#f2c9a5', '#dba77d', '#ab7349', '#7b4b2c'], SHIRT = ['#e5484d', '#3e8ef7', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e5689f', '#ef7a38'], PANTS = ['#2b3150', '#3b2f2a', '#203a4a', '#3a3a44'];
const WALL = 34, CH = 62, CCH = 68, OPEN_DESKS = 10, OL = '#151827', SL = 3600, FL = 1800;
const ZT = ['rgba(124,108,214,.13)', 'rgba(62,142,247,.12)', 'rgba(48,164,108,.12)', 'rgba(245,165,36,.11)', 'rgba(229,104,159,.12)', 'rgba(18,165,148,.12)', 'rgba(239,122,56,.11)'];
const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function dress(b) { const h = hash(b.id); b.hair = HAIR[h % 7]; b.skin = SKIN[(h >>> 3) % 4]; b.shirt = SHIRT[(h >>> 5) % 8]; b.pants = PANTS[(h >>> 8) % 4]; b.seed = h; b.nap = (h >>> 11) % 2; return b; }

/* Standalone sprite drawer for the bot drawer avatar. */
export function drawSprite(canvas, b) {
  canvas.width = 20; canvas.height = 24; const g = canvas.getContext('2d'); dress(b);
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const x = 6, top = 3;
  R(x - 1, top + 18, 10, 1, P.sh); R(x, top + 13, 8, 5, OL); R(x + 1, top + 13, 2, 4, b.pants); R(x + 5, top + 13, 2, 3, b.pants); R(x + 1, top + 17, 2, 1, '#0c0e18'); R(x + 5, top + 16, 2, 1, '#0c0e18');
  R(x - 3, top + 6, 14, 8, OL); R(x - 1, top + 7, 10, 6, b.shirt); R(x - 2, top + 8, 2, 4, b.shirt); R(x + 8, top + 9, 2, 4, b.shirt); R(x - 2, top + 12, 2, 1, b.skin); R(x + 8, top + 13, 2, 1, b.skin);
  R(x - 1, top - 1, 10, 9, OL); R(x, top, 8, 7, b.skin); R(x, top, 8, 3, b.hair); R(x, top + 3, 1, 2, b.hair); R(x + 7, top + 3, 1, 2, b.hair); R(x + 2, top + 4, 1, 1, OL); R(x + 5, top + 4, 1, 1, OL); R(x + 3, top + 6, 2, 1, '#c0786a');
}

/**
 * Mount an office into `root`.
 * opts: { data, live:{state,label,text,sub}|null, openDesks:n (default 10), emptyLegend, emptySign, onDesk(id), selectable:true, interactiveTasks:true }
 */
export function createOffice(root, opts = {}) {
  const DUM = document.createElement('div');
  const q = s => root.querySelector(s) || DUM;
  let M = model(opts.data), SEL = '', hov = null, curMsg = -2, conn = opts.live || null;
  M.bots.forEach(dress);
  const cv = q('#cv'), ctx = cv.getContext ? cv.getContext('2d') : null, buf = document.createElement('canvas'), bx = buf.getContext('2d'), bg = document.createElement('canvas');
  let g, W = 300, H = 200, S = 2, PX = 1, cells = [], pos = {}, lounge = null, zonesL = [], dead = false;
  const OPEN = opts.openDesks == null ? OPEN_DESKS : Math.max(0, opts.openDesks | 0);
  const ARR = {}; // bot id -> T when it arrived live (short fade/drop-in)
  function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  function bot(id) { id = str(id); return M.BY[id] || { id, name: id ? id + ' (removed)' : 'Unassigned', emoji: '❔', role: '' }; }
  // Live flight queue: empty on load. History stays in the comms log only.
  let LM = [], flightT0 = 0;

  /* ---------- HUD ---------- */
  function liveCell() {
    if (!conn) return '<div class="st"><span class="k">Last updated</span><span class="v sm">' + esc(M.updated ? dateTime(M.updated) : 'Not set') + '</span></div>';
    return '<div class="st live" id="conncell"><span class="k">Connection</span><span class="lv ' + esc(conn.state || '') + '"><i class="pulse"></i>' + esc(conn.label || 'LIVE') + '</span><span class="cs">' + esc(conn.text || '') + '</span><span class="hint">' + esc(conn.sub || '') + '</span></div>';
  }
  function renderHud() {
    const cnt = { done: 0, in_progress: 0, waiting: 0 }; let oth = 0;
    M.tasks.forEach(t => { if (Object.prototype.hasOwnProperty.call(cnt, t.status)) cnt[t.status]++; else oth++; });
    const overall = avg(M.tasks), active = M.bots.filter(b => b.act !== 'idle').length, n = M.tasks.length;
    q('#hud').innerHTML = '<div class="st"><span class="k">Overall progress</span><span class="v">' + (n ? overall + '%' : '—') + ' <small>' + (n ? 'avg of ' + n + ' task' + (n === 1 ? '' : 's') : 'no tasks yet') + '</small></span><div class="xp" role="progressbar" aria-label="Overall progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + overall + '"><i style="width:' + overall + '%"></i></div></div>' +
      '<div class="st"><span class="k">Active bots</span><span class="v">' + active + '<small> / ' + M.bots.length + '</small></span></div>' +
      '<div class="st"><span class="k">Done</span><span class="v c-ok">' + cnt.done + '</span></div>' +
      '<div class="st"><span class="k">In progress</span><span class="v c-run">' + cnt.in_progress + '</span></div>' +
      '<div class="st"><span class="k">Waiting</span><span class="v c-wait">' + cnt.waiting + (oth ? '<small> +' + oth + ' other</small>' : '') + '</span></div>' + liveCell();
    const ac = {}; let rv = 0; M.bots.forEach(b => { if (b.revoked) rv++; else ac[b.act] = (ac[b.act] || 0) + 1; });
    q('#legend').innerHTML = M.bots.length ? Object.keys(ACTS).filter(a => ac[a]).map(a => '<span><i class="a-' + a + '"></i>' + ac[a] + ' ' + ACTS[a].toLowerCase() + '</span>').join('') + (rv ? '<span><i class="rvk-i"></i>' + rv + ' key revoked</span>' : '') + (OPEN ? '<span class="lg-open"><i class="open-i"></i>' + OPEN + ' open desk' + (OPEN === 1 ? '' : 's') + '</span>' : '') + '<span>· Tap a desk to see what a bot is doing</span>' : '<span>' + esc(opts.emptyLegend || 'No bots yet.') + '</span>';
  }
  function setConn(c) { conn = c; const el = root.querySelector('#conncell'); if (el) el.outerHTML = liveCell(); else renderHud(); }

  /* ---------- missions panel ---------- */
  function av(id, c, r) { const b = bot(id), l = r + ': ' + b.name; return '<span class="av ' + c + '" role="img" title="' + esc(l) + '" aria-label="' + esc(l) + '">' + esc(b.emoji) + '</span>'; }
  function taskLi(t, ctx2) {
    const s = tst(t.status), d = dueInfo(t);
    const who = ctx2 ? (t.owner === ctx2 ? 'Owner' : 'Helping ' + esc(bot(t.owner).name)) : (t.owner ? esc(bot(t.owner).name) : '<span class="unas">Unassigned</span>') + (t.helpers.length ? ' + ' + t.helpers.length + ' helper' + (t.helpers.length > 1 ? 's' : '') : '');
    return '<li class="task s-' + s[1] + (isDone(t) ? ' done' : '') + '"><div class="who">' + av(t.owner, 'lg', 'Owner') + (t.helpers.length ? '<span class="hl">' + t.helpers.map(x => av(x, 'sm', 'Helper')).join('') + '</span>' : '') + '</div>' +
      '<div><div class="ttl">' + esc(t.title) + '</div><div class="row"><span class="chip s-' + s[1] + '">' + esc(s[0]) + '</span><span>' + who + '</span>' + (d ? '<span class="due ' + d.c + '">' + esc(d.txt) + '</span>' : '') + '</div>' +
      '<div class="bar"><span role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + t.progress + '"><i style="width:' + t.progress + '%"></i></span><b class="mono">' + t.progress + '%</b></div>' +
      (t.note ? '<p class="note">' + esc(t.note) + '</p>' : '') + '</div></li>';
  }
  function renderTasks() {
    let h = '', n = 0;
    M.missions.forEach(m => {
      const l = SEL ? m.tasks.filter(t => involves(t, SEL)) : m.tasks;
      if (SEL && !l.length) return; n += l.length;
      const dn = m.tasks.filter(isDone).length;
      h += '<section class="q"><div class="qh"><div><span class="qk">' + (m.other ? 'Unsorted' : 'Quest') + '</span><h3>' + esc(m.name) + '</h3></div><span class="qp mono">' + (m.tasks.length ? avg(m.tasks) + '%' : '—') + '</span><span class="qm">' + dn + ' of ' + m.tasks.length + ' done</span></div>' +
        (l.length ? '<ul class="tasks">' + l.map(t => taskLi(t)).join('') + '</ul>' : '<p class="empty">No tasks in this mission yet.</p>') + '</section>';
    });
    if (!h) h = '<p class="empty">' + (SEL ? esc(bot(SEL).name) + ' has no assigned tasks right now.' : 'No missions or tasks yet.') + '</p>';
    q('#quests').innerHTML = h;
    q('#sel').innerHTML = SEL ? 'Showing ' + n + ' task' + (n === 1 ? '' : 's') + ' for <b>' + esc(bot(SEL).emoji + ' ' + bot(SEL).name) + '</b>' : 'All ' + M.tasks.length + ' task' + (M.tasks.length === 1 ? '' : 's');
    q('#reset').hidden = !SEL;
    root.querySelectorAll('#ov .desk').forEach(d => d.setAttribute('aria-pressed', String(d.getAttribute('data-bot') === SEL)));
  }

  /* ---------- comms log ---------- */
  function renderLog() {
    // Newest first, so the latest message is always at the top (never below the fold, desktop or mobile).
    const L = q('#log'); const msgs = M.msgs;
    L.innerHTML = msgs.length ? msgs.slice().reverse().map(m => {
      const f = bot(m.from), t = bot(m.to);
      return '<li data-k="' + esc(m.key) + '"><time>' + hhmmTs(m.ts) + '</time><span class="ft"><b>' + esc(f.emoji + ' ' + f.name) + '</b> → <b>' + esc(t.emoji + ' ' + t.name) + '</b></span><span class="tx">' + esc(m.text) + '</span></li>';
    }).join('') : '<li class="empty" style="display:block">No messages yet.</li>';
    q('#logn').textContent = msgs.length ? msgs.length + ' message' + (msgs.length === 1 ? '' : 's') + ' · newest first · times ' + TZ_LABEL + (M.skipped ? ' · ' + M.skipped + ' skipped (unknown bot)' : '') : 'times ' + TZ_LABEL;
    if (msgs.length && opts.logToEnd !== false) L.scrollTop = 0;
    curMsg = -2;
  }

  /* ---------- office drawing (verbatim pixel art from the approved renderer) ---------- */
  function partners(b) {
    const s = []; const add = id => { if (id && id !== b.id && M.BY[id] && s.indexOf(id) < 0) s.push(id); };
    M.tasks.forEach(t => { if (involves(t, b.id)) { add(t.owner); t.helpers.forEach(add); } });
    M.msgs.forEach(m => { if (m.from === b.id) add(m.to); if (m.to === b.id) add(m.from); });
    return s.slice(0, 4);
  }
  function vacants(n) { const V = []; for (let i = 0; i < n; i++) V.push({ id: '__open' + i, name: '', role: '', emoji: '', act: 'idle', doing: '', vacant: 1, seed: hash('open' + i) }); return V; }
  /** Team zones, derived only from data: bots.team (blank = General). Zone order = earliest created_at of its bots, then name. */
  function zoneList() {
    const Z = new Map();
    M.bots.forEach(b => {
      const key = b.team ? 't:' + b.team.toLowerCase() : 'general'; let z = Z.get(key);
      if (!z) Z.set(key, z = { key, name: b.team || 'General', general: !b.team, bots: [], ts: b.cts, ord: b.ord });
      z.bots.push(b);
    });
    return [...Z.values()].sort((a, b) => (isFinite(a.ts) && isFinite(b.ts) ? a.ts - b.ts : a.ord - b.ord) || a.name.localeCompare(b.name));
  }
  function layout() {
    const stage = q('#stage'), par = stage.parentNode || DUM;
    const cssW = (par.clientWidth - parseFloat(getComputedStyle(par).paddingLeft || 0) * 2) || 360, dpr = Math.max(1, window.devicePixelRatio || 1), mob = cssW < 600;
    S = Math.max(1, Math.round(dpr * (mob ? 1.5 : 2))); PX = S / dpr; W = Math.max(120, Math.floor(cssW / PX));
    const cols = Math.max(2, Math.min(Math.floor(cssW / (mob ? 118 : 136)), Math.floor((W - 8) / 58))), cw = Math.floor((W - 8) / cols), x0 = Math.floor((W - cols * cw) / 2);
    const ZH = mob ? 16 : 13, ZP = 4; let y = WALL + 4, deskNo = 0; cells = []; pos = {}; lounge = null; zonesL = [];
    const chief = M.chief;
    function add(b, x, yy, w, h, ch, zone) {
      const cx = x + (w >> 1), c = { b, x, y: yy, w, h, cx, ch, zone, no: ++deskNo, scr: ch ? [{ x: cx - 19, y: yy + 5 }, { x: cx + 3, y: yy + 5 }] : [{ x: cx - 8, y: yy + 5 }] };
      c.home = { x: cx + 14, y: yy + 46, c }; c.visit = { x: cx - 15, y: yy + 46, c }; cells.push(c); pos[b.id] = c;
    }
    // Blocks: one per team zone, then a shared "Open desks" area that always holds OPEN empty desks.
    const blocks = zoneList().map(z => { const hasChief = z.bots.indexOf(chief) >= 0, mem = z.bots.filter(b => b !== chief); return { z, hasChief, mem }; });
    if (OPEN) blocks.push({ z: { key: 'open', name: 'Open desks', open: 1 }, hasChief: false, mem: vacants(OPEN) });
    blocks.forEach(B => {
      const n = B.mem.length;
      B.w = mob ? cols : Math.min(cols, Math.max(n, B.hasChief ? 2 : 1));
      B.rows = Math.ceil(n / B.w); B.h = ZH + (B.hasChief ? CCH : 0) + B.rows * CH + ZP;
    });
    // Shelf packing: zones sit side by side when they fit (desktop); on mobile every zone is full width, stacked.
    let shelf = [], used = 0;
    const flush = () => {
      if (!shelf.length) return; const sh = Math.max(...shelf.map(B => B.h)); let col = 0; // left-aligned: a zone joining a shelf never moves the zones already on it
      shelf.forEach(B => {
        const zx = x0 + col * cw, zw = B.w * cw, zy = y; col += B.w;
        const Z = { key: B.z.key, name: B.z.name, open: !!B.z.open, general: !!B.z.general, x: zx, y: zy, w: zw, h: sh, n: B.z.open ? B.mem.length : B.z.bots.length, tint: B.z.open ? '' : ZT[hash(B.z.key) % ZT.length] };
        zonesL.push(Z); let yy = zy + ZH;
        if (B.hasChief) { const lw = Math.min(zw - 8, Math.max(112, cw * 2)), lx = zx + Math.floor((zw - lw) / 2); lounge = { x: lx, y: yy, w: lw, zx, zw }; add(chief, lx, yy, lw, CCH, 1, Z); yy += CCH; }
        for (let r = 0; r < B.rows; r++) {
          const row = B.mem.slice(r * B.w, (r + 1) * B.w), sc = Math.floor((B.w - row.length) / 2);
          row.forEach((b, j) => add(b, zx + (sc + j) * cw, yy, cw, CH, 0, Z)); yy += CH;
        }
      });
      y += sh; shelf = []; used = 0;
    };
    blocks.forEach(B => { if (used + B.w > cols) flush(); shelf.push(B); used += B.w; });
    flush(); H = y + 6;
    cells.forEach(c => { c.route = null; if (c.b.act === 'coordinating' && !c.b.vacant) { const ps = partners(c.b).map(id => pos[id]).filter(Boolean); if (ps.length) c.route = mkRoute(c, ps); } });
    buf.width = bg.width = W; buf.height = bg.height = H; cv.width = W * S; cv.height = H * S;
    stage.style.width = W * PX + 'px'; stage.style.height = H * PX + 'px'; cv.style.width = W * PX + 'px'; cv.style.height = H * PX + 'px';
    drawBg(); placeDesks(); curMsg = -2;
  }
  function mkRoute(c, ps) {
    const segs = []; let T = 0, cur = c.home;
    const seg = (a, b, d) => { segs.push({ a, b, t0: T, d }); T += d; };
    function go(to) {
      const p = cur; const pts = Math.abs(p.y - to.y) < 2 ? [to] : (() => { const cc = p.c, gx = Math.abs(cc.x - to.x) < Math.abs(cc.x + cc.w - to.x) ? cc.x + 1 : cc.x + cc.w - 2; return [{ x: gx, y: p.y }, { x: gx, y: to.y }, to]; })();
      pts.forEach(qq => { const d = Math.hypot(qq.x - cur.x, qq.y - cur.y) / 0.042; if (d > 0) seg(cur, qq, d); cur = qq; });
    }
    seg(cur, cur, 2400); ps.forEach(p => { go(p.visit); seg(cur, cur, 1500); }); go(c.home); return { segs, T };
  }
  function walkAt(c, t) { const r = c.route, tt = t % r.T; for (const s of r.segs) { if (tt < s.t0 + s.d) { const u = (tt - s.t0) / s.d; return { x: s.a.x + (s.b.x - s.a.x) * u, y: s.a.y + (s.b.y - s.a.y) * u, mv: s.a !== s.b, up: s.b.y < s.a.y - .5 }; } } return { x: c.home.x, y: c.home.y }; }
  function plant(x, y, big) {
    R(x + 1, y + (big ? 11 : 6), 8, big ? 7 : 5, '#b0643a'); R(x, y + (big ? 10 : 5), 10, 2, '#8f4f2c'); const L = '#3aa35c', Dk = '#257a40';
    if (big) { R(x + 2, y, 6, 4, L); R(x, y + 3, 10, 5, L); R(x + 1, y + 7, 8, 3, Dk); R(x + 4, y + 1, 2, 8, Dk); } else { R(x + 2, y, 6, 3, L); R(x + 1, y + 2, 8, 3, Dk); }
  }
  function drawBg() {
    g = bg.getContext('2d'); const chief = M.chief;
    for (let y = WALL; y < H; y += 8) for (let x = 0; x < W; x += 8) R(x, y, 8, 8, P.fl[((x + y) >> 3) & 1]);
    R(0, 0, W, WALL, P.wall); R(0, 0, W, 3, P.trim); R(0, WALL - 3, W, 3, P.base); R(0, WALL, W, 2, P.sh);
    const nw = Math.max(1, Math.floor(W / 95));
    for (let i = 0; i < nw; i++) {
      const wx = Math.round((i + .5) * W / nw) - 14; R(wx - 2, 6, 32, 21, P.frame); R(wx, 8, 28, 17, P.win); R(wx, 8, 28, 7, P.winHi);
      for (let k = 0; k < 5; k++) { const h = hash('s' + i + k); R(wx + 1 + h % 26, 9 + (h >> 5) % 15, 1, 1, P.star); }
      if (i === nw - 1) { R(wx + 19, 10, 4, 4, '#f4f0d0'); R(wx + 21, 10, 2, 2, P.win); }
      R(wx + 13, 8, 2, 17, P.frame); R(wx, 16, 28, 1, P.frame); R(wx - 3, 26, 34, 2, P.trim);
    }
    if (W > 220) { let kx = Math.round(W / nw) - 4; if (nw === 1) kx = W - 30; R(kx, 10, 9, 9, '#2a2d3a'); R(kx + 1, 11, 7, 7, '#f4f1e8'); R(kx + 4, 12, 1, 3, '#2a2d3a'); R(kx + 4, 14, 2, 1, '#2a2d3a'); }
    plant(3, WALL - 12, 1); plant(W - 13, WALL - 12, 1);
    // Team zones: a tinted floor area with a border; the open-desk area gets a dotted outline only.
    zonesL.forEach(Z => {
      const x = Z.x + 2, y = Z.y + 1, w = Z.w - 4, h = Z.h - 3;
      if (Z.open) { for (let k = x; k < x + w; k += 4) { R(k, y, 2, 1, 'rgba(223,230,255,.16)'); R(k, y + h - 1, 2, 1, 'rgba(223,230,255,.16)'); } for (let k = y; k < y + h; k += 4) { R(x, k, 1, 2, 'rgba(223,230,255,.16)'); R(x + w - 1, k, 1, 2, 'rgba(223,230,255,.16)'); } return; }
      R(x, y, w, h, Z.tint); R(x, y, w, 1, 'rgba(255,255,255,.1)'); R(x, y + h - 1, w, 1, 'rgba(0,0,0,.25)'); R(x, y, 1, h, 'rgba(255,255,255,.07)'); R(x + w - 1, y, 1, h, 'rgba(0,0,0,.2)');
    });
    const L = lounge;
    if (L) {
      const ly = L.y;
      if (chief) { R(L.x + 4, ly + 2, L.w - 8, CCH - 8, P.rugB); R(L.x + 6, ly + 4, L.w - 12, CCH - 12, P.rug); for (let rx = L.x + 8; rx < L.x + L.w - 8; rx += 6) R(rx, ly + 4, 2, 1, P.rugB); }
      const sp = L.x - L.zx;
      if (sp >= 22) {
        const cx0 = L.zx + Math.max(4, Math.round(sp / 2) - 7);
        R(cx0, ly + 16, 14, 22, '#3b3f4d'); R(cx0 + 1, ly + 17, 12, 6, '#5b6070'); R(cx0 + 3, ly + 19, 8, 2, '#20232c'); R(cx0 + 10, ly + 18, 2, 2, '#e5484d'); R(cx0 + 4, ly + 26, 6, 7, '#20232c'); R(cx0 + 5, ly + 30, 4, 3, '#f4f0e6'); R(cx0, ly + 38, 14, 2, P.sh);
        const wx2 = L.zx + L.zw - Math.round(sp / 2) - 5; R(wx2 + 1, ly + 12, 8, 9, '#8fd3ff'); R(wx2 + 2, ly + 13, 3, 6, '#c9ecff'); R(wx2, ly + 21, 10, 17, '#e9edf3'); R(wx2 + 2, ly + 25, 2, 2, '#3e8ef7'); R(wx2 + 6, ly + 25, 2, 2, '#e5484d'); R(wx2, ly + 38, 10, 2, P.sh);
        if (sp >= 40) { plant(cx0 + 2, ly + 44, 0); plant(wx2, ly + 44, 0); }
      }
    }
    cells.forEach(c => {
      const x = c.cx, Y = c.y, dw = c.ch ? 68 : 42, dx = x - (dw >> 1);
      R(dx + 2, Y + 34, dw, 3, P.sh); R(dx, Y + 16, dw, 13, P.desk); R(dx, Y + 16, dw, 1, P.deskHi); R(dx, Y + 29, dw, 5, P.deskFr); R(dx, Y + 28, dw, 1, 'rgba(0,0,0,.18)'); R(dx + 1, Y + 34, 2, 3, P.deskFr); R(dx + dw - 3, Y + 34, 2, 3, P.deskFr);
      c.scr.forEach(s => { R(s.x - 1, s.y - 1, 18, 12, P.bez); R(s.x + 6, s.y + 11, 4, 3, P.bez); R(s.x + 4, s.y + 13, 8, 1, P.bez); });
      R(x - 7, Y + 21, 14, 3, '#c9cfdc'); R(x - 6, Y + 22, 12, 1, '#8e97ad'); R(x + 10, Y + 21, 2, 3, '#c9cfdc');
      const d = c.b.seed % 3;
      if (c.ch) { R(x + 7, Y + 30, 14, 3, '#d9b44a'); R(dx + 3, Y + 18, 6, 5, '#f2efe6'); R(dx + 3, Y + 19, 5, 1, '#9aa3b8'); R(dx + dw - 10, Y + 17, 7, 3, '#3aa35c'); R(dx + dw - 9, Y + 20, 5, 3, '#b0643a'); }
      else if (d === 0) { R(dx + dw - 7, Y + 18, 5, 4, '#f2efe6'); R(dx + dw - 7, Y + 19, 4, 1, '#9aa3b8'); } else if (d === 1) { R(dx + 2, Y + 18, 4, 3, '#3aa35c'); R(dx + 2, Y + 21, 4, 2, '#b0643a'); } else { R(dx + dw - 6, Y + 18, 3, 4, '#f5a524'); }
      R(x - 6, Y + 39, 12, 3, P.chairD); R(x - 10, Y + 3, 20, 14, P.lamp);
    });
  }
  function scrn(s, a, t, seed, i) {
    const x = s.x, y = s.y;
    if (a === 'idle') { R(x, y, 16, 10, P.off); if (((t / 900) | 0) % 2) R(x + 14, y + 8, 1, 1, '#3fd07a'); return; }
    if (a === 'typing') {
      R(x, y, 16, 10, '#0f1a2e'); const ln = ((t / 700) | 0) % 4;
      for (let k = 0; k < 4; k++) { let w = 3 + (hash(seed + ':' + k + i) % 10); if (k === ln) w = Math.min(w, 1 + ((t % 700) / 60 | 0)); if (k > ln && ((t / 2800) | 0) % 2 === 0) continue; R(x + 1 + (k % 2) * 2, y + 1 + k * 2, w, 1, ['#7dd3fc', '#c4b5fd', '#86efac', '#fcd34d'][k]); }
      if (((t / 260) | 0) % 2) R(x + 14, y + 1 + ln * 2, 1, 1, '#fff'); if (hash('f' + ((t / 90) | 0) + seed) % 13 === 0) R(x, y, 16, 10, 'rgba(255,255,255,.12)'); return;
    }
    if (a === 'browsing') { R(x, y, 16, 10, '#e8eefc'); R(x, y, 16, 2, '#3e8ef7'); const o = ((t / 110) | 0) % 6; for (let k = -1; k < 4; k++) { const yy = y + 3 + k * 2 + (6 - o) / 3 | 0; if (yy < y + 2 || yy > y + 9) continue; R(x + 1, yy, k % 3 === 0 ? 6 : 12 - (k & 1) * 3, 1, k % 3 === 0 ? '#f5a524' : '#8e97ad'); } return; }
    if (a === 'reading') { R(x, y, 16, 10, '#f7f4ea'); for (let k = 0; k < 4; k++) R(x + 2, y + 2 + k * 2, k === 3 ? 7 : 12, 1, '#8e97ad'); return; }
    if (a === 'waiting') { R(x, y, 16, 10, '#16213f'); const f = ((t / 350) | 0) % 4; for (let k = 0; k < 3; k++) R(x + 4 + k * 3, y + 4, 2, 2, k < f ? '#fbbf24' : '#3b4670'); return; }
    R(x, y, 16, 10, '#1d1838'); const b = ((t / 600) | 0) % 2; R(x + 2, y + 2, 8, 3, b ? '#c4b5fd' : '#7c6bd6'); R(x + 6, y + 6, 8, 3, b ? '#7dd3fc' : '#3e8ef7');
  }
  // Bigger Z letters so idle snooze reads clearly on mobile as well as desktop.
  function zz(x, y, c, n) { const w = n === 2 ? 7 : n ? 6 : 5; R(x - 1, y - 1, w + 2, w + 2, OL); R(x, y, w, 2, c); for (let i = 2; i < w - 1; i++) R(x + w - 1 - i, y + i, 2, 1, c); R(x, y + w - 1, w, 2, c); }
  function arm(x, y1, y2, c) { R(x - 1, y1, 4, y2 - y1, OL); R(x, y1, 2, y2 - y1, c); }
  function hand(x, y, c) { R(x - 1, y - 1, 4, 4, OL); R(x, y, 2, 2, c); }
  function seated(c, t) {
    const b = c.b, x = c.cx, Y = c.y, a = b.act, hy = Y + 24, sh = b.shirt, sk = b.skin;
    if (a === 'idle') { // idle = head down on the desk (the DOM .zzz floats above it)
      R(x - 8, Y + 28, 16, 9, OL); R(x - 7, Y + 29, 14, 8, sh); R(x - 10, Y + 24, 20, 5, OL); R(x - 9, Y + 25, 18, 3, sh); R(x - 5, Y + 19, 10, 8, OL); R(x - 4, Y + 20, 8, 6, b.hair);
      return;
    }
    if (a === 'typing') { const f = RM ? 0 : ((t / 110) | 0) % 2; arm(x - 8, Y + 25, hy + 9, sh); arm(x + 6, Y + 25, hy + 9, sh); hand(x - 8, Y + 23 - f, sk); hand(x + 6, Y + 22 + f, sk); }
    else if (a === 'browsing') { const m = RM ? 0 : Math.round(Math.sin(t / 300)); arm(x - 8, Y + 25, hy + 9, sh); hand(x - 8, Y + 23, sk); arm(x + 7, Y + 25, hy + 9, sh); hand(x + 9 + m, Y + 23, sk); }
    else if (a === 'reading') { const bo = RM ? 0 : ((t / 1200) | 0) % 2; arm(x + 6, Y + 22, hy + 9, sh); R(x + 1, Y + 10 + bo, 10, 13, OL); R(x + 2, Y + 11 + bo, 8, 11, '#f7f4ea'); for (let k = 0; k < 4; k++) R(x + 3, Y + 13 + bo + k * 2, k === 3 ? 4 : 6, 1, '#8e97ad'); hand(x + 2, Y + 20 + bo, sk); }
    else if (a === 'waiting') { const tp = RM ? 0 : ((t / 260) | 0) % 2; arm(x - 9, Y + 27, hy + 9, sh); hand(x - 9, Y + 25 - tp, sk); const cy = Y - 1 + (RM ? 0 : ((t / 500) | 0) % 2); R(x + 11, cy, 9, 9, OL); R(x + 12, cy + 2, 7, 5, '#fbbf24'); R(x + 13, cy + 1, 5, 7, '#fbbf24'); R(x + 15, cy + 2, 1, 3, OL); R(x + 15, cy + 4, 2, 1, OL); }
    else if (a === 'idle') { const sip = !RM && (t % 4200) < 1300, my = sip ? Y + 22 : Y + 21, mx = sip ? x + 5 : x + 11; if (sip) arm(x + 6, Y + 25, hy + 9, sh); R(mx - 1, my - 1, 6, 5, OL); R(mx, my, 3, 3, '#efe9dc'); R(mx + 3, my + 1, 1, 1, '#efe9dc'); if (sip) hand(x + 5, Y + 24, sk); if (!sip && !RM && ((t / 400) | 0) % 2) R(mx + 1, my - 3, 1, 2, '#d7dbe6'); }
    R(x - 8, hy + 6, 16, 9, OL); R(x - 7, hy + 7, 14, 8, sh); R(x - 7, hy + 7, 14, 1, 'rgba(255,255,255,.2)'); R(x - 5, hy - 1, 10, 9, OL); R(x - 4, hy, 8, 7, b.hair); R(x - 3, hy + 1, 3, 1, 'rgba(255,255,255,.22)'); R(x - 5, hy + 3, 1, 2, sk); R(x + 4, hy + 3, 1, 2, sk);
  }
  function stand(fx, fy, b, t, mv, up) {
    const x = Math.round(fx) - 4, top = Math.round(fy) - 18, st = mv && !RM ? ((t / 140) | 0) % 2 : 0;
    R(x - 1, top + 18, 10, 1, P.sh); R(x, top + 13, 8, 5, OL); R(x + 1, top + 13, 2, st ? 3 : 4, b.pants); R(x + 5, top + 13, 2, st ? 4 : 3, b.pants); R(x + 1, top + 16 + (st ? 0 : 1), 2, 1, '#0c0e18'); R(x + 5, top + 17 - (st ? 0 : 1), 2, 1, '#0c0e18');
    R(x - 3, top + 6, 14, 8, OL); R(x - 1, top + 7, 10, 6, b.shirt); R(x - 2, top + 8 + st, 2, 4, b.shirt); R(x + 8, top + 9 - st, 2, 4, b.shirt); R(x - 2, top + 12 + st, 2, 1, b.skin); R(x + 8, top + 13 - st, 2, 1, b.skin);
    R(x - 1, top - 1, 10, 9, OL); if (up) { R(x, top, 8, 7, b.hair); } else { R(x, top, 8, 7, b.skin); R(x, top, 8, 3, b.hair); R(x, top + 3, 1, 2, b.hair); R(x + 7, top + 3, 1, 2, b.hair); if (((t / 2600) | 0) % 5 || RM) { R(x + 2, top + 4, 1, 1, OL); R(x + 5, top + 4, 1, 1, OL); } R(x + 3, top + 6, 2, 1, '#c0786a'); }
  }
  function env(x, y) { x = Math.round(x); y = Math.round(y); R(x - 4, y - 3, 9, 7, '#7a5c2e'); R(x - 3, y - 2, 7, 5, '#fffaf0'); R(x - 2, y - 1, 1, 1, '#c9a96e'); R(x - 1, y, 1, 1, '#c9a96e'); R(x, y + 1, 1, 1, '#e5484d'); R(x + 1, y, 1, 1, '#c9a96e'); R(x + 2, y - 1, 1, 1, '#c9a96e'); }
  // One-shot flight only. History never flies; LM holds at most the live INSERT that arrived while this page is open.
  function msgAt(t) {
    if (!LM.length || RM) return { i: -1 };
    const l = t - flightT0;
    if (l >= SL) return { i: -1, done: true }; // finished: caller clears LM
    return { i: 0, l };
  }
  function draw(t) {
    if (!ctx) return;
    g = bx; g.drawImage(bg, 0, 0);
    cells.forEach(c => {
      const b = c.b, x = c.cx, Y = c.y;
      if (b.vacant) { // open desk: furniture only, screen off, no worker
        g.globalAlpha = .55; c.scr.forEach(s => R(s.x, s.y, 16, 10, P.off));
        R(x - 6, Y + 36, 12, 7, OL); R(x - 5, Y + 37, 10, 5, P.chair); R(x - 5, Y + 37, 10, 1, P.chairHi); R(x - 1, Y + 42, 2, 2, P.chairD); R(x - 5, Y + 44, 3, 1, P.chairD); R(x + 2, Y + 44, 3, 1, P.chairD);
        g.globalAlpha = 1; return;
      }
      let k = 1; if (ARR[b.id] != null) { k = RM ? 1 : Math.min(1, (t - ARR[b.id]) / 700); if (k >= 1) delete ARR[b.id]; }
      g.globalAlpha = (b.act === 'idle' ? (b.revoked ? .38 : .78) : 1) * Math.max(.05, k);
      c.scr.forEach((s, i) => scrn(s, b.act, t, b.seed, i));
      if (b.act !== 'coordinating') seated(c, t);
      R(x - 6, Y + 36, 12, 7, OL); R(x - 5, Y + 37, 10, 5, P.chair); R(x - 5, Y + 37, 10, 1, P.chairHi); R(x - 1, Y + 42, 2, 2, P.chairD); R(x - 5, Y + 44, 3, 1, P.chairD); R(x + 2, Y + 44, 3, 1, P.chairD);
      g.globalAlpha = 1;
    });
    cells.forEach(c => { if (c.b.act !== 'coordinating' || c.b.vacant) return; const w = c.route && !RM ? walkAt(c, t) : { x: c.home.x, y: c.home.y }; stand(w.x, w.y, c.b, t, w.mv, w.up); });
    const m = msgAt(t);
    if (m.done) {
      LM = []; curMsg = -2;
      const bub = q('#mbub'), log = q('#log');
      if (bub) bub.hidden = true;
      if (log) log.querySelectorAll('li.now').forEach(li => li.classList.remove('now'));
    }
    if (m.i >= 0 && !RM) {
      const MM = LM[m.i], A = pos[MM.from], B = pos[MM.to], l = m.l;
      if (A && B && l >= 300 && l < 300 + FL) {
        let u = (l - 300) / FL; u = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const ax = A.cx, ay = A.y + 6, bx2 = B.cx, by = B.y + 6, mx = (ax + bx2) / 2, my = Math.min(ay, by) - Math.min(46, Math.hypot(bx2 - ax, by - ay) * .35 + 12);
        const qq = v => ({ x: (1 - v) * (1 - v) * ax + 2 * (1 - v) * v * mx + v * v * bx2, y: (1 - v) * (1 - v) * ay + 2 * (1 - v) * v * my + v * v * by });
        for (let k = 3; k > 0; k--) { const p = qq(Math.max(0, u - k * .035)); g.globalAlpha = .25 * (4 - k); R(p.x, p.y, 2, 2, '#fbbf24'); } g.globalAlpha = 1; const e = qq(u); env(e.x, e.y);
      }
      if (A && B && l >= 300 + FL && l < 300 + FL + 450) { const k2 = (l - 300 - FL) / 450, d = 2 + Math.round(k2 * 7); g.globalAlpha = 1 - k2; [[d, 0], [-d, 0], [0, d], [0, -d], [d - 2, d - 2], [2 - d, d - 2]].forEach(o => R(B.cx + o[0], B.y + 10 + o[1], 2, 2, '#fbbf24')); g.globalAlpha = 1; }
    }
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(buf, 0, 0, W * S, H * S);
    msgUI(m);
  }

  /* ---------- overlays ---------- */
  /** Sprite head rect relative to the desk, in CSS px (idle = head down at Y+19; seated = Y+23). Coordinating bots stand elsewhere. */
  function headRect(c) {
    if (c.b.act === 'coordinating') return null;
    const top = c.b.act === 'idle' ? 19 : 23, h = c.b.act === 'idle' ? 8 : 9;
    return { x: (c.cx - 5 - c.x) * PX, y: top * PX, w: 10 * PX, h: h * PX };
  }
  function headAttr(c) { const r = headRect(c); return r ? ' data-head="' + [r.x, r.y, r.w, r.h].map(v => +v.toFixed(1)).join(',') + '"' : ''; }
  /** ZZZ beside/above the napping head, slightly right (starts past the head's right edge). Bottom sits at Y+24. */
  function zzzHtml(c) {
    const left = (c.cx + 5 - c.x) * PX, bottom = 24 * PX; // bottom = top of the shoulders; starts at the head's right edge
    return '<span class="zzz" aria-hidden="true" style="left:' + left.toFixed(1) + 'px;top:' + bottom.toFixed(1) + 'px"><b>Z</b><b>Z</b><b>Z</b></span>';
  }
  function placeDesks() {
    const ov = q('#ov');
    const zs = zonesL.map(Z => '<div class="zsign' + (Z.open ? ' open' : '') + (Z.general ? ' general' : '') + '" data-zone="' + (Z.open ? '__open' : esc(Z.name)) + '" data-n="' + Z.n + '" style="left:' + ((Z.x + 4) * PX).toFixed(1) + 'px;top:' + ((Z.y + 2) * PX).toFixed(1) + 'px;max-width:' + ((Z.w - 8) * PX).toFixed(1) + 'px"><span class="zn">' + esc(Z.name) + '</span><small>' + Z.n + '</small></div>').join('');
    ov.innerHTML = zs + cells.map(c => {
      const b = c.b, box = 'left:' + c.x * PX + 'px;top:' + c.y * PX + 'px;width:' + c.w * PX + 'px;height:' + c.h * PX + 'px';
      if (b.vacant) return '<div class="odesk" aria-hidden="true" data-desk="' + c.no + '" data-zone="__open" style="' + box + '"><span class="oplate">Open desk</span></div>';
      const lab = b.name + ', ' + (b.role || 'bot') + '. ' + (b.revoked ? 'Key revoked' : ACTS[b.act] + (b.doing ? ': ' + b.doing : '')) + '. Select to open details.';
      const arr = ARR[b.id] != null && !RM;
      return '<button type="button" class="desk' + (arr ? ' arrive' : '') + '" data-bot="' + esc(b.id) + '" data-desk="' + c.no + '" data-zone="' + esc(c.zone.name) + '" data-act="' + b.act + (b.revoked ? '" data-revoked="1' : '') + '"' + headAttr(c) + ' aria-pressed="' + (SEL === b.id) + '" aria-label="' + esc(lab) + '" style="' + box + '">' +
        (b.revoked ? '<span class="rvk" aria-hidden="true">Key revoked</span>' : '') +
        '<span class="plate' + (b.act === 'idle' ? ' idle' : '') + (b.revoked ? ' revoked' : '') + (c.ch ? ' chief' : '') + '" aria-hidden="true">' + (c.ch ? '<span style="display:flex;gap:4px;align-items:center"><span class="dot a-' + b.act + '"></span>' + esc(b.emoji) + ' <span class="nm">' + esc(b.name) + '</span></span><small>' + esc(M.chiefLabel) + '</small>' : '<span class="dot a-' + b.act + '"></span>' + esc(b.emoji) + ' <span class="nm">' + esc(b.name) + '</span>') + '</span>' +
        (b.act === 'idle' && !b.revoked ? zzzHtml(c) : '') + '</button>';
    }).join('');
    const oz = zonesL.find(Z => Z.open);
    if (!M.bots.length && opts.emptySign && oz) ov.innerHTML += '<div class="sign" style="left:' + (oz.x + oz.w / 2) * PX + 'px;top:' + (oz.y + oz.h / 2) * PX + 'px">' + esc(opts.emptySign) + '</div>';
    if (hov && pos[hov]) showHov(hov); else hideHov();
    if (opts.onLayout) opts.onLayout();
  }
  function placeBub(el, c) {
    el.hidden = false; el.classList.remove('l'); el.style.maxWidth = '';
    const sw = W * PX, hw = (c.ch ? 34 : 21) + 4, xr = (c.cx + hw) * PX + 6, xl = (c.cx - hw) * PX - 6, sR = sw - xr - 3, sL = xl - 3; let bw = el.offsetWidth; const left = sR >= bw || (sL < bw && sR >= sL);
    const sp = left ? sR : sL; if (bw > sp) { el.style.maxWidth = Math.max(140, sp) + 'px'; bw = el.offsetWidth; }
    const x = left ? Math.min(xr, sw - bw - 2) : Math.max(2, xl - bw); if (!left) el.classList.add('l');
    const bh = el.offsetHeight, y = Math.max(bh / 2 + 2, c.y * PX + bh / 2 + 2, (c.y + 11) * PX); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.setProperty('--tail', Math.max(10, Math.min(bh - 10, (c.y + 11) * PX - y + bh / 2)) + 'px');
  }
  function showHov(id) {
    const c = pos[id], el = q('#hbub'); if (!c) return; hov = id; const b = c.b;
    el.innerHTML = '<b>' + esc(b.emoji + ' ' + b.name) + '</b><span class="act">● ' + (b.revoked ? 'Key revoked' : ACTS[b.act]) + '</span><br>' + esc(b.revoked ? 'Can\'t report until the owner rotates its key' : (b.doing || b.role || 'No details')); placeBub(el, c);
    if (curMsg >= 0 && LM[curMsg] && LM[curMsg].from === id) q('#mbub').hidden = true;
  }
  function hideHov() { hov = null; q('#hbub').hidden = true; curMsg = -2; }
  function msgUI(m) {
    let i = m.i; const show = i >= 0 && (RM || m.l < 3300); if (!show) i = -1; if (i === curMsg) return; curMsg = i; const el = q('#mbub');
    const key = i >= 0 ? LM[i].key : null, L = q('#log');
    L.querySelectorAll('li[data-k]').forEach(li => {
      const on = li.getAttribute('data-k') === key; li.classList.toggle('now', on);
      if (on && L.clientHeight) { const o = li.offsetTop - L.offsetTop; if (o < L.scrollTop || o + li.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = o - 8; }
    });
    if (i < 0 || hov === LM[i].from || !pos[LM[i].from]) { el.hidden = true; return; }
    const MM = LM[i], f = bot(MM.from), to = bot(MM.to); el.innerHTML = '<b>' + esc(f.emoji + ' ' + f.name) + ' → ' + esc(to.emoji + ' ' + to.name) + '</b>' + esc(trunc(MM.text, 50)); placeBub(el, pos[MM.from]);
  }
  const ov = q('#ov');
  const onClick = e => {
    const d = e.target.closest('.desk'); if (!d) return; const id = d.getAttribute('data-bot');
    if (opts.onDesk) opts.onDesk(id); else { SEL = SEL === id ? '' : id; renderTasks(); if (SEL) showHov(id); else hideHov(); }
  };
  ov.addEventListener('click', onClick);
  ov.addEventListener('mouseover', e => { const d = e.target.closest('.desk'); if (d) showHov(d.getAttribute('data-bot')); });
  ov.addEventListener('mouseleave', () => { if (!ov.contains(document.activeElement)) hideHov(); });
  ov.addEventListener('focusin', e => { const d = e.target.closest('.desk'); if (d) showHov(d.getAttribute('data-bot')); });
  ov.addEventListener('focusout', e => { if (!ov.contains(e.relatedTarget)) hideHov(); });
  const resetBtn = q('#reset'); const onReset = () => { select(''); if (opts.onReset) opts.onReset(); };
  resetBtn.addEventListener('click', onReset);

  /* ---------- loop ---------- */
  let T = 0, run = false, prev = 0, last = 0, raf = 0;
  function frame(now) { if (!run || dead) return; raf = requestAnimationFrame(frame); if (now - last < 38) return; const dt = prev ? Math.min(now - prev, 120) : 0; prev = last = now; T += dt; draw(T); }
  function start() { if (dead) return; if (RM || run || document.hidden) { draw(T); return; } run = true; prev = 0; raf = requestAnimationFrame(frame); }
  function stop() { run = false; cancelAnimationFrame(raf); }
  const onVis = () => { document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVis);
  let lw = -1; const stageP = q('#stage').parentNode;
  function relayout(force) { const w = stageP ? stageP.clientWidth : 0; if (w === lw && !force) return; lw = w; layout(); draw(T); }
  let ro = null; if (window.ResizeObserver && stageP) { ro = new ResizeObserver(() => relayout()); ro.observe(stageP); } else addEventListener('resize', () => relayout());

  function select(id) { SEL = id && M.BY[id] ? id : ''; renderTasks(); if (SEL) showHov(SEL); else hideHov(); }
  function setData(D) {
    const lkey = () => M.bots.map(b => b.id + ':' + b.act + (b.revoked ? 'R' : '') + ':' + b.team).join(',') + '|' + (M.chief && M.chief.id);
    const prevKeys = new Set(M.msgs.map(m => m.key)), prevLayout = lkey(), prevIds = new Set(M.bots.map(b => b.id));
    M = model(D); M.bots.forEach(dress);
    M.bots.forEach(b => { if (!prevIds.has(b.id) && !RM) ARR[b.id] = T; }); // live arrival (never on first load)
    if (SEL && !M.BY[SEL]) SEL = '';
    renderHud(); renderTasks(); renderLog();
    if (lkey() !== prevLayout) relayout(true); else placeDesks();
    // Fly ONLY messages that arrived while this page is open (realtime INSERT / mock sim). Never replay history.
    const fresh = M.msgs.filter(m => !prevKeys.has(m.key));
    if (fresh.length && !RM) { LM = [fresh[fresh.length - 1]]; flightT0 = T; curMsg = -2; }
    else if (LM.length && !M.msgs.some(m => m.key === LM[0].key)) {
      // Run reset / retention dropped the in-flight message — abort plane + bubble.
      LM = []; curMsg = -2; const bub = q('#mbub'); if (bub) bub.hidden = true;
    }
    draw(T);
  }
  renderHud(); renderTasks(); renderLog(); relayout(true); start();

  return {
    setData, setConn, select, get selected() { return SEL; }, get model() { return M; }, bot,
    deskEl: id => root.querySelector('.desk[data-bot="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'),
    taskLi, relayout: () => relayout(true),
    destroy() { dead = true; stop(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect(); },
  };
}
