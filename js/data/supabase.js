/* SUPABASE backend. Uses the vendored, pinned supabase-js UMD build (vendor/supabase-js-2.117.3).
   Server-side contract (tables, RLS, RPCs) is documented in BACKEND.md. Only the public anon key is used here. */
import { siteUrl } from './index.js';
import { slugify } from '../util.js';

const SB_SRC = new URL('../../vendor/supabase-js-2.117.3/supabase.js', import.meta.url).href;
const BOT_COLS = 'id,workspace_id,slug,name,role,emoji,activity,doing,last_heartbeat,key_prefix,revoked_at,created_at'; // key hashes live in bot_keys (no client access)
const WS_COLS = 'id,slug,name,owner_id,share_enabled,created_at';

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.supabase && window.supabase.createClient) return res();
    const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load supabase-js')); document.head.appendChild(s);
  });
}
const FRIENDLY = {
  not_authenticated: 'Please sign in again.', not_owner: 'Only the workspace owner can do that.', slug_taken: 'That workspace address is taken.',
  bot_slug_taken: 'A bot with that id already exists.', bot_limit: 'This workspace has reached its bot limit (50).', workspace_limit: 'You can own up to 10 workspaces.',
  member_limit: 'This workspace has reached its member limit (50).', invalid_email: 'Enter a valid email address.', cannot_remove_owner: 'The owner can\'t be removed.',
  confirm_name_mismatch: 'The name doesn\'t match; nothing was deleted.', only_viewer_role_can_be_invited: 'Only viewers can be invited.',
};
/** Unwrap a supabase-js result; backend errors look like 'swarm:<status>:<code>'. */
function chk({ data, error }) {
  if (error) { const m = /swarm:(\d+):([a-z_]+)/.exec(error.message || ''); const e = new Error(m ? (FRIENDLY[m[2]] || m[2].replace(/_/g, ' ')) : (error.message || String(error))); e.code = m ? m[2] : error.code; throw e; }
  return data;
}
function one(d) { return Array.isArray(d) ? d[0] : d; }

export async function create(cfg) {
  await loadScript(SB_SRC);
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  // Finish a magic-link / OAuth redirect (tokens in the URL hash) before the router reads location.hash.
  const { data: { session } } = await sb.auth.getSession();
  let user = session ? mapUser(session.user) : null;
  function mapUser(u) { return u ? { id: u.id, email: u.email, name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '' } : null; }
  const authCbs = new Set();
  sb.auth.onAuthStateChange((_e, s) => { const nu = s ? mapUser(s.user) : null; const changed = (nu && nu.id) !== (user && user.id); user = nu; if (changed) authCbs.forEach(cb => cb(user)); });

  return {
    mode: 'supabase', client: sb,
    async getUser() { return user; },
    onAuth(cb) { authCbs.add(cb); return () => authCbs.delete(cb); },
    async signInWithEmail(email) {
      chk(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl(), shouldCreateUser: true } }));
      return { instant: false, message: 'Check your inbox: we sent a sign-in link to ' + email + '.' };
    },
    async signInWithOAuth(provider) { chk(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl() } })); },
    async signOut() { await sb.auth.signOut(); },

    async listWorkspaces() {
      if (!user) return [];
      const rows = chk(await sb.from('workspaces').select(WS_COLS).order('created_at'));
      return rows.map(w => ({ ...w, role: w.owner_id === user.id ? 'owner' : 'viewer' }));
    },
    async ensureWorkspace() {
      try { chk(await sb.rpc('accept_pending_invites')); } catch (e) { console.warn('accept_pending_invites failed:', e.message); }
      const l = await this.listWorkspaces(); return l[0] || this.createWorkspace('My office');
    },
    async createWorkspace(name) {
      const base = slugify(name) || 'office'; let lastErr = null;
      for (let i = 0; i < 4; i++) {
        const slug = i ? (base.slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6)) : (base.length < 2 ? base + '-hq' : base);
        try {
          const id = chk(await sb.rpc('create_workspace', { p_name: name, p_slug: slug }));
          const w = one(chk(await sb.from('workspaces').select(WS_COLS).eq('id', id)));
          return { ...(w || { id, slug, name, owner_id: user && user.id }), role: 'owner' };
        } catch (e) { lastErr = e; if (!/slug_taken/.test(e.code || e.message)) throw e; }
      }
      throw lastErr;
    },
    async renameWorkspace(id, name) { chk(await sb.rpc('update_workspace', { p_workspace_id: id, p_name: name })); },
    async deleteWorkspace(id, confirmName) { chk(await sb.rpc('delete_workspace', { p_workspace_id: id, p_confirm_name: confirmName })); },
    async loadRows(wsId) {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const [bots, missions, tasks, messages] = await Promise.all([
        sb.from('bots').select(BOT_COLS).eq('workspace_id', wsId).order('created_at'),
        sb.from('missions').select('*').eq('workspace_id', wsId).order('sort'),
        sb.from('tasks').select('*').eq('workspace_id', wsId),
        sb.from('messages').select('*').eq('workspace_id', wsId).gte('created_at', since).order('created_at', { ascending: false }).limit(500),
      ]);
      return { bots: chk(bots), missions: chk(missions), tasks: chk(tasks), messages: chk(messages).reverse() };
    },
    /** Realtime: postgres_changes on bots/tasks/missions/messages. onStatus gets connecting|connected|reconnecting|offline. */
    subscribe(wsId, { onEvent, onStatus, onResync }) {
      let state = 'connecting', wasDown = false, closed = false;
      const set = s => { if (state !== s) { state = s; onStatus && onStatus(s); } };
      onStatus && onStatus('connecting');
      const ch = sb.channel('ws-' + wsId);
      for (const table of ['bots', 'tasks', 'missions', 'messages']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: 'workspace_id=eq.' + wsId }, p => {
          onEvent({ table, eventType: p.eventType, new: p.eventType === 'DELETE' ? null : p.new, old: p.old });
        });
      }
      ch.subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') { if (wasDown && onResync) onResync(); wasDown = false; set(navigator.onLine === false ? 'offline' : 'connected'); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { wasDown = true; set(navigator.onLine === false ? 'offline' : 'reconnecting'); }
        else if (status === 'CLOSED') { wasDown = true; set('offline'); }
      });
      const off = () => { wasDown = true; set('offline'); }, on = () => set('reconnecting');
      addEventListener('offline', off); addEventListener('online', on);
      return () => { closed = true; removeEventListener('offline', off); removeEventListener('online', on); sb.removeChannel(ch); };
    },

    async listMembers(wsId) {
      const rows = chk(await sb.from('members').select('workspace_id,user_id,email,role,invited_at,accepted_at').eq('workspace_id', wsId).order('role'));
      return rows.map(m => ({ ...m, is_you: !!user && m.user_id === user.id }));
    },
    async inviteViewer(wsId, email) { return chk(await sb.rpc('invite_member', { p_workspace_id: wsId, p_email: String(email).trim().toLowerCase(), p_role: 'viewer' })); },
    async removeMember(wsId, email) { chk(await sb.rpc('remove_member', { p_workspace_id: wsId, p_email: email })); },
    async getShare(wsId) { return one(chk(await sb.from('workspaces').select('share_enabled,share_token').eq('id', wsId))) || { share_enabled: false, share_token: null }; },
    async setShareLink(wsId, enabled, regenerate = false) {
      const r = chk(await sb.rpc('set_share_link', { p_workspace_id: wsId, p_enabled: !!enabled, p_regenerate: !!regenerate }));
      return { share_enabled: !!(r && r.enabled), share_token: (r && r.token) || null };
    },
    async loadShared(_slug, token) {
      const d = chk(await sb.rpc('get_shared_workspace', { p_token: token }));
      if (!d || !d.workspace) throw new Error('This read-only link is off or no longer valid.');
      const id = (x, k) => (x || []).map(r => ({ id: r.id != null ? r.id : r.slug, ...r }));
      return { workspace: d.workspace, rows: { bots: id(d.bots), missions: id(d.missions), tasks: id(d.tasks), messages: id(d.messages) } };
    },

    async createBot(wsId, { slug, name, role, emoji }) {
      const r = chk(await sb.rpc('create_bot', { p_workspace_id: wsId, p_slug: slugify(slug || name), p_name: name, p_role: role || '', p_emoji: emoji || '🤖' }));
      return { bot: { id: r.bot_id, slug: r.slug, name, role: role || '', emoji: emoji || '🤖', key_prefix: r.key_prefix, revoked_at: null }, api_key: r.key };
    },
    async rotateBotKey(botId) { const r = chk(await sb.rpc('rotate_bot_key', { p_bot_id: botId })); return { api_key: r.key, key_prefix: r.key_prefix }; },
    async revokeBotKey(botId) { chk(await sb.rpc('revoke_bot_key', { p_bot_id: botId })); },
    async removeBot(botId) { chk(await sb.rpc('remove_bot', { p_bot_id: botId })); },
  };
}
