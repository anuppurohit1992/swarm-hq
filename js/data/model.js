/* Mapping between Supabase table rows (CONTRACT.md) and the office engine's status.json shape.
   Also keeps a live in-memory copy of a workspace that realtime / mock events are applied to. */
export function toStatus(rows) {
  const bots = (rows.bots || []).map(b => ({
    id: b.slug, uuid: b.id, name: b.name, role: b.role, emoji: b.emoji, activity: b.activity, doing: b.doing,
    last_heartbeat: b.last_heartbeat, key_prefix: b.key_prefix, revoked: !!b.revoked_at,
  }));
  const missionsSorted = (rows.missions || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name)));
  const tasks = (rows.tasks || []).map(t => ({
    id: t.slug, title: t.title, owner: t.owner_bot && t.owner_bot !== 'unassigned' ? t.owner_bot : '', helpers: t.helpers || [], status: t.status, progress: t.progress,
    due: t.due, note: t.note, mission: t.mission_slug, updated_at: t.updated_at,
  }));
  const missions = missionsSorted.map(m => ({ id: m.slug, name: m.name, tasks: tasks.filter(t => t.mission === m.slug).map(t => t.id) }));
  const messages = (rows.messages || []).map(m => ({ id: String(m.id), time: m.created_at, from: m.from_bot, to: m.to_bot, text: m.text }));
  let updated = '';
  for (const b of rows.bots || []) if (b.last_heartbeat && b.last_heartbeat > updated) updated = b.last_heartbeat;
  for (const t of rows.tasks || []) if (t.updated_at && t.updated_at > updated) updated = t.updated_at;
  return { updated, bots, missions, tasks, messages };
}

/** Comms log retention: 24 h or current run start, whichever is later. */
export const RETAIN_MS = 24 * 864e5;

/** Live copy of one workspace's rows. apply() takes a Supabase postgres_changes-style payload. */
export class WorkspaceRows {
  constructor(rows) { this.set(rows); }
  set(rows) {
    this.rows = { bots: [...(rows.bots || [])], missions: [...(rows.missions || [])], tasks: [...(rows.tasks || [])], messages: [...(rows.messages || [])] };
    this.runStartedAt = rows.run_started_at || null;
    this.prune();
  }
  /** Drop messages older than 24h or before run_started_at. Returns true if anything changed. */
  prune() {
    const cut24 = Date.now() - RETAIN_MS;
    const runCut = this.runStartedAt ? Date.parse(this.runStartedAt) : NaN;
    const before = this.rows.messages.length;
    this.rows.messages = this.rows.messages.filter(m => {
      const t = Date.parse(m.created_at);
      if (!(t >= cut24)) return false;
      if (!isNaN(runCut) && t < runCut) return false;
      return true;
    }).slice(-500);
    return this.rows.messages.length !== before;
  }
  /** New run: keep only messages at/after this timestamp. */
  applyRunStarted(ts) {
    if (!ts) return false;
    if (this.runStartedAt && !(Date.parse(ts) > Date.parse(this.runStartedAt))) return false;
    this.runStartedAt = ts;
    this.prune();
    return true;
  }
  apply({ table, eventType, new: n, old: o }) {
    if (table === 'workspaces') {
      if (eventType === 'UPDATE' && n && n.run_started_at) return this.applyRunStarted(n.run_started_at);
      return false;
    }
    const list = this.rows[table]; if (!list) return false;
    if (eventType === 'DELETE') {
      const id = o && o.id; if (id == null) return false;
      const i = list.findIndex(r => r.id === id || String(r.id) === String(id));
      if (i >= 0) { list.splice(i, 1); return true; }
      return false; // unknown id → other workspace (or already gone)
    }
    if (!n) return false;
    const i = list.findIndex(r => r.id === n.id || String(r.id) === String(n.id));
    if (i >= 0) list[i] = { ...list[i], ...n }; else list.push(n);
    if (table === 'messages') { list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))); this.prune(); }
    return true;
  }
  status() { return toStatus(this.rows); }
}
