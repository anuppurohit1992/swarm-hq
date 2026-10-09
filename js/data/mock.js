/* MOCK backend: same interface as supabase.js, in memory, with simulated realtime updates.
   Nothing leaves the browser. Uses only the fictional demo dataset. */
import { demoRows, extraBots, SIM_LINES, SIM_DOING } from './demo-data.js';
import { randHex, slugify, slugWithSuffix, normTeam } from '../util.js';

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function b62(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, x => B62[x % 62]).join(''); }
/** Same format as the backend: sk_live_ + 43 base62 chars; prefix = first 12 chars. */
function newKey() { return 'sk_live_' + b62(43); }

const SESSION_KEY = 'swarmhq-mock-session';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function create() {
  const now = Date.now();
  const user = { id: 'mock-user-0001', email: 'you@example.com', name: 'Demo user' };
  const db = {
    workspaces: [
      { id: 'ws-demo', slug: 'demo-hq', name: 'Demo HQ', owner_id: user.id, share_enabled: false, share_token: null, created_at: new Date(now - 864e5 * 3).toISOString(), run_started_at: new Date(now - 2 * 3600e3).toISOString() },
      { id: 'ws-empty', slug: 'my-office', name: 'My office', owner_id: user.id, share_enabled: false, share_token: null, created_at: new Date(now).toISOString(), run_started_at: null },
    ],
    members: [
      { workspace_id: 'ws-demo', user_id: user.id, email: user.email, role: 'owner', invited_at: null, accepted_at: new Date(now - 864e5 * 3).toISOString() },
      { workspace_id: 'ws-demo', user_id: null, email: 'friend@example.com', role: 'viewer', invited_at: new Date(now - 36e5).toISOString(), accepted_at: null },
      { workspace_id: 'ws-empty', user_id: user.id, email: user.email, role: 'owner', invited_at: null, accepted_at: new Date(now).toISOString() },
    ],
    rows: { 'ws-demo': demoRows(now, 'ws-demo'), 'ws-empty': { bots: [], missions: [], tasks: [], messages: [] } },
  };
  // ?mock=1&scene=mixed → deterministic mixed activities for QA (3 idle, 1 revoked, rest active). Fictional demo data only.
  const SCENE = new URLSearchParams(location.search).get('scene');
  if (SCENE === 'mixed') {
    const set = { lead: 'coordinating', mailbot: 'idle', research: 'browsing', calendar: 'waiting', code: 'typing', writer: 'idle', support: 'idle' };
    db.rows['ws-demo'].bots.forEach(b => { if (set[b.slug]) { b.activity = set[b.slug]; if (b.activity === 'idle') b.doing = ''; } if (b.slug === 'calendar') b.revoked_at = new Date(now - 36e5).toISOString(); });
  }
  // ?mock=1&bots=N → Demo HQ grows to N bots (fictional helpers) to exercise layout growth.
  const NB = parseInt(new URLSearchParams(location.search).get('bots'), 10);
  if (NB > db.rows['ws-demo'].bots.length) db.rows['ws-demo'].bots.push(...extraBots(Math.min(50, NB) - db.rows['ws-demo'].bots.length, now, 'ws-demo'));
  let signedIn = false; try { signedIn = localStorage.getItem(SESSION_KEY) === '1'; } catch (e) { /* storage blocked */ }
  const authCbs = new Set(), subs = new Map(); let msgId = 1000;
  const emitAuth = () => authCbs.forEach(cb => cb(signedIn ? user : null));
  function emit(wsId, table, eventType, n, o) { (subs.get(wsId) || new Set()).forEach(s => s.onEvent({ table, eventType, new: n, old: o })); }
  /** Like bot_report new_run: clear messages, bump run_started_at, then callers emit the new activity/message. */
  function maybeStartRun(wsId, nextActivity) {
    if (!nextActivity || nextActivity === 'idle') return false;
    const R = db.rows[wsId], w = ws(wsId);
    const awake = (R.bots || []).filter(b => !b.revoked_at);
    if (!awake.length || awake.some(b => b.activity && b.activity !== 'idle')) return false;
    for (const m of R.messages.splice(0)) emit(wsId, 'messages', 'DELETE', null, { id: m.id });
    w.run_started_at = new Date().toISOString();
    emit(wsId, 'workspaces', 'UPDATE', { id: w.id, run_started_at: w.run_started_at });
    return true;
  }
  function snapshotRows(wsId) {
    const R = db.rows[wsId], w = ws(wsId);
    const cut = Date.now() - 24 * 864e5;
    const runCut = w.run_started_at ? Date.parse(w.run_started_at) : 0;
    const messages = (R.messages || []).filter(m => {
      const t = Date.parse(m.created_at);
      return t >= cut && (!runCut || t >= runCut);
    });
    return JSON.parse(JSON.stringify({ bots: R.bots, missions: R.missions, tasks: R.tasks, messages, run_started_at: w.run_started_at || null }));
  }
  function ws(id) { const w = db.workspaces.find(x => x.id === id); if (!w) throw new Error('Workspace not found'); return w; }
  function requireOwner(id) { if (!signedIn || ws(id).owner_id !== user.id) throw new Error('Only the workspace owner can do that'); }
  function rpcGetShareToken({ p_workspace_id }) { requireOwner(p_workspace_id); const w = ws(p_workspace_id); return { enabled: w.share_enabled, token: w.share_token }; }

  /* --- simulated activity on Demo HQ (fictional) --- */
  let simTimer = 0, simI = 0, flipTimer = 0;
  function simTick() {
    const R = db.rows['ws-demo']; if (!R.bots.length) return;
    const t = new Date().toISOString(), r = Math.random(); simI++;
    if (simI % 3 === 0) {
      const [f, to, text] = SIM_LINES[(simI / 3 | 0) % SIM_LINES.length];
      if (R.bots.some(b => b.slug === f && !b.revoked_at) && R.bots.some(b => b.slug === to)) {
        const m = { id: ++msgId, workspace_id: 'ws-demo', from_bot: f, to_bot: to, text, created_at: t }; R.messages.push(m); emit('ws-demo', 'messages', 'INSERT', m);
      }
    } else if (r < .55) {
      const b = R.bots[1 + Math.floor(Math.random() * (R.bots.length - 1))] || R.bots[0]; if (b.revoked_at) return;
      const acts = ['typing', 'browsing', 'reading', 'waiting', 'idle', 'idle'];
      const next = acts[Math.floor(Math.random() * acts.length)];
      maybeStartRun('ws-demo', next);
      b.activity = next; const d = SIM_DOING[b.slug]; b.doing = b.activity === 'idle' ? '' : (d ? d[Math.floor(Math.random() * d.length)] : 'Working'); b.last_heartbeat = t;
      emit('ws-demo', 'bots', 'UPDATE', { ...b });
    } else {
      const open = R.tasks.filter(x => x.status !== 'done' && R.bots.some(b => b.slug === x.owner_bot && !b.revoked_at)); if (!open.length) return;
      const k = open[Math.floor(Math.random() * open.length)]; k.progress = Math.min(100, k.progress + 5); if (k.progress >= 100) k.status = 'done'; else if (k.status === 'waiting' && Math.random() < .3) k.status = 'in_progress'; k.updated_at = t;
      const ob = R.bots.find(b => b.slug === k.owner_bot); if (ob) { ob.last_heartbeat = t; emit('ws-demo', 'bots', 'UPDATE', { ...ob }); }
      emit('ws-demo', 'tasks', 'UPDATE', { ...k });
    }
  }

  const api = {
    mode: 'mock',
    async getUser() { return signedIn ? user : null; },
    onAuth(cb) { authCbs.add(cb); return () => authCbs.delete(cb); },
    async signInWithEmail(email) {
      await sleep(250); signedIn = true; user.email = email || user.email; db.members.forEach(m => { if (m.user_id === user.id) m.email = user.email; });
      try { localStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }
      emitAuth(); return { instant: true, message: 'Mock mode: no email was sent. You are signed in as a demo user.' };
    },
    async signInWithOAuth() { throw new Error('OAuth is not available in mock mode.'); },
    async signOut() { signedIn = false; try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } emitAuth(); },

    async listWorkspaces() {
      if (!signedIn) return [];
      return db.workspaces.filter(w => db.members.some(m => m.workspace_id === w.id && m.user_id === user.id))
        .map(w => ({ ...w, role: w.owner_id === user.id ? 'owner' : 'viewer' }));
    },
    async acceptInvites() { return 0; },
    async createWorkspace(name) {
      const id = 'ws-' + randHex(4), base = slugify(name) || 'office'; let slug = slugWithSuffix(base); while (db.workspaces.some(w => w.slug === slug)) slug = slugWithSuffix(base);
      const w = { id, slug, name, owner_id: user.id, share_enabled: false, share_token: null, created_at: new Date().toISOString(), run_started_at: null };
      db.workspaces.push(w); db.members.push({ workspace_id: id, user_id: user.id, email: user.email, role: 'owner', invited_at: null, accepted_at: w.created_at });
      db.rows[id] = { bots: [], missions: [], tasks: [], messages: [] }; return { ...w, role: 'owner' };
    },
    async renameWorkspace(id, name) { requireOwner(id); ws(id).name = name; return { ...ws(id) }; },
    async deleteWorkspace(id, confirmName) { requireOwner(id); if (confirmName !== ws(id).name) throw new Error('The name doesn\'t match; nothing was deleted'); db.workspaces = db.workspaces.filter(w => w.id !== id); db.members = db.members.filter(m => m.workspace_id !== id); delete db.rows[id]; },
    async loadRows(wsId) { await sleep(120); if (!db.rows[wsId]) throw new Error('Workspace not found'); return snapshotRows(wsId); },
    subscribe(wsId, { onEvent, onStatus, onResync }) {
      const s = { onEvent, onStatus, onResync }; if (!subs.has(wsId)) subs.set(wsId, new Set()); subs.get(wsId).add(s);
      onStatus && onStatus('connecting'); setTimeout(() => onStatus && onStatus('mock'), 300);
      if (wsId === 'ws-demo' && !simTimer) simTimer = setInterval(simTick, 3500);
      // QA scene: deterministic idle ↔ typing flip on Inbox Bot every 4 s (on top of the random sim)
      if (wsId === 'ws-demo' && SCENE === 'mixed' && !flipTimer) flipTimer = setInterval(() => {
        const b = db.rows['ws-demo'].bots.find(x => x.slug === 'mailbot'); if (!b || b.revoked_at) return;
        const next = b.activity === 'idle' ? 'typing' : 'idle'; maybeStartRun('ws-demo', next);
        b.activity = next; b.doing = next === 'idle' ? '' : 'Sorting new email into folders'; b.last_heartbeat = new Date().toISOString();
        emit('ws-demo', 'bots', 'UPDATE', { ...b });
      }, 4000);
      return () => { subs.get(wsId).delete(s); if (wsId === 'ws-demo' && !subs.get(wsId).size) { clearInterval(simTimer); simTimer = 0; clearInterval(flipTimer); flipTimer = 0; } };
    },

    async listMembers(wsId) { return db.members.filter(m => m.workspace_id === wsId).map(m => ({ ...m, is_you: m.user_id === user.id })); },
    async inviteViewer(wsId, email) {
      requireOwner(wsId); email = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
      if (db.members.some(m => m.workspace_id === wsId && m.email === email)) throw new Error('That person is already a member or invited');
      const m = { workspace_id: wsId, user_id: null, email, role: 'viewer', invited_at: new Date().toISOString(), accepted_at: null }; db.members.push(m); return m;
    },
    async removeMember(wsId, email) { requireOwner(wsId); db.members = db.members.filter(m => !(m.workspace_id === wsId && m.email === email && m.role !== 'owner')); },
    // Mirrors the backend: get_share_token(p_workspace_id) → {enabled, token}; getShare maps it the same way as supabase.js.
    async getShare(wsId) { const r = rpcGetShareToken({ p_workspace_id: wsId }); return { share_enabled: !!(r && r.enabled), share_token: (r && r.token) || null }; },
    // Mirrors set_share_link(p_workspace_id, p_enabled, p_regenerate): disabling clears the token.
    async setShareLink(wsId, enabled, regenerate = false) { requireOwner(wsId); const w = ws(wsId); w.share_enabled = !!enabled; w.share_token = enabled ? ((!w.share_token || regenerate) ? b62(32) : w.share_token) : null; const r = { enabled: w.share_enabled, token: w.share_token }; return { share_enabled: !!r.enabled, share_token: r.token || null }; },
    async loadShared(slug, token) {
      await sleep(120); const w = token ? db.workspaces.find(x => x.share_enabled && x.share_token === token) : null; // like get_shared_workspace(p_token): the token alone identifies the workspace
      if (!w || !w.share_enabled || !token || token !== w.share_token) throw new Error('This read-only link is off or no longer valid.');
      return { workspace: { name: w.name, slug: w.slug, run_started_at: w.run_started_at || null }, rows: snapshotRows(w.id) };
    },

    async createBot(wsId, { slug, name, role, emoji, team }) {
      requireOwner(wsId); const R = db.rows[wsId]; slug = slugify(slug || name);
      if (!slug) throw new Error('Give the bot a name'); if (R.bots.some(b => b.slug === slug)) throw new Error('A bot with id "' + slug + '" already exists');
      const api_key = newKey(), t = new Date().toISOString();
      const b = { id: 'bot-' + randHex(6), workspace_id: wsId, slug, name: name || slug, role: role || '', emoji: emoji || '🤖', activity: 'idle', doing: '', last_heartbeat: null, key_prefix: api_key.slice(0, 12), revoked_at: null, created_at: t, team: normTeam(team) };
      R.bots.push(b); emit(wsId, 'bots', 'INSERT', { ...b });
      // Simulate the bot's first report a few seconds later, so the desk lights up like it would for real.
      if (!api.qa.skipFirstReport) setTimeout(() => { const x = R.bots.find(y => y.id === b.id); if (!x || x.revoked_at) return; maybeStartRun(wsId, 'typing'); x.activity = 'typing'; x.doing = 'Hello from mock mode: first report received'; x.last_heartbeat = new Date().toISOString(); emit(wsId, 'bots', 'UPDATE', { ...x }); }, 5000);
      return { bot: { ...b }, api_key };
    },
    async rotateBotKey(botId) { const b = findBot(botId); requireOwner(b.workspace_id); const api_key = newKey(); b.key_prefix = api_key.slice(0, 12); b.revoked_at = null; emit(b.workspace_id, 'bots', 'UPDATE', { ...b }); return { api_key, key_prefix: b.key_prefix }; },
    async setBotTeam(botId, team) { const b = findBot(botId); requireOwner(b.workspace_id); b.team = normTeam(team); emit(b.workspace_id, 'bots', 'UPDATE', { ...b }); return { team: b.team }; },
    async revokeBotKey(botId) { const b = findBot(botId); requireOwner(b.workspace_id); b.revoked_at = new Date().toISOString(); emit(b.workspace_id, 'bots', 'UPDATE', { ...b }); },
    // Mirrors remove_bot: tasks it owned become unassigned (owner_bot = null), it is dropped from helpers.
    async removeBot(botId) {
      const b = findBot(botId); requireOwner(b.workspace_id); const R = db.rows[b.workspace_id];
      R.tasks.forEach(t => { let ch = false; if (t.owner_bot === b.slug) { t.owner_bot = null; ch = true; } if ((t.helpers || []).includes(b.slug)) { t.helpers = t.helpers.filter(h => h !== b.slug); ch = true; } if (ch) emit(b.workspace_id, 'tasks', 'UPDATE', { ...t }); });
      R.bots = R.bots.filter(x => x.id !== botId); emit(b.workspace_id, 'bots', 'DELETE', null, { id: botId });
    },
  };
  // QA hook (mock mode only, fictional data): drive the same realtime path the Supabase client uses.
  api.qa = { emit, rows: id => db.rows[id], skipFirstReport: false };
  try { window.__swarmMock = api; } catch (e) { /* ignore */ }
  return api;
  function findBot(id) { for (const k in db.rows) { const b = db.rows[k].bots.find(x => x.id === id); if (b) return b; } throw new Error('Bot not found'); }
}
