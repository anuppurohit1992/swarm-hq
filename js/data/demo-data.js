/* Neutral demo office ("Demo HQ"), same inline demo as the approved landing mockup 01 v2.
   Every bot, task and message here is made up; nothing comes from a real workspace.
   Used by the public landing preview, the #/demo page and mock mode. Rows use the Supabase
   table shape from CONTRACT.md so mock mode exercises the same mapping code as live mode. */
// slug, name, role, emoji, activity, doing, team (null = General zone). All fictional.
const BOTS = [
  ['lead', 'Lead Bot', 'Coordinator', '🎯', 'coordinating', 'Handing out today\'s tasks', 'Front office'],
  ['mailbot', 'Inbox Bot', 'Email triage', '📬', 'typing', 'Sorting new email into folders', 'Admin'],
  ['research', 'Research Bot', 'Web research', '🔎', 'browsing', 'Comparing three project tools', 'Content'],
  ['calendar', 'Calendar Bot', 'Scheduling', '📅', 'waiting', 'Waiting for replies to a meeting invite', 'Admin'],
  ['code', 'Code Bot', 'Bug fixes', '💻', 'typing', 'Fixing a sign-in bug', 'Build'],
  ['writer', 'Writer Bot', 'Drafts and docs', '✍️', 'reading', 'Reading notes for the weekly update', 'Content'],
  ['support', 'Support Bot', 'Help desk', '🎧', 'idle', '', null],
];
const MISSIONS = [['weekly', 'Weekly update', 0], ['ops', 'Keep things running', 1]];
// slug, mission, title, owner, helpers, status, progress, dueDays, note
const TASKS = [
  ['compare-tools', 'weekly', 'Compare three project tools', 'research', ['writer'], 'in_progress', 60, null, 'Two of three tools reviewed'],
  ['draft-update', 'weekly', 'Draft the weekly update', 'writer', ['lead'], 'in_progress', 25, 1, ''],
  ['triage', 'ops', 'Sort the inbox', 'mailbot', [], 'in_progress', 80, null, ''],
  ['sync-slot', 'ops', 'Find a slot for the team sync', 'calendar', [], 'waiting', 50, 2, 'Waiting on two replies'],
  ['signin-bug', 'ops', 'Fix the sign-in bug', 'code', [], 'in_progress', 70, null, 'Reproduced; fix in progress'],
  ['answer-questions', 'ops', 'Answer two customer questions', 'support', ['mailbot'], 'done', 100, null, ''],
];
// minutesAgo, from, to, text
const MSGS = [
  [48, 'lead', 'research', 'Compare three project tools for the team'],
  [36, 'mailbot', 'support', 'Two customer questions need answers'],
  [23, 'lead', 'calendar', 'Find a 30-minute slot for the team sync'],
  [14, 'code', 'lead', 'Sign-in bug reproduced, fix in progress'],
  [6, 'research', 'writer', 'Notes are ready: pros and cons in the doc'],
  [1, 'lead', 'writer', 'Please start the weekly update'],
];
const HB_SECONDS = { lead: 4, mailbot: 12, research: 9, calendar: 40, code: 20, writer: 15, support: 1560 };
function isoDay(d) { return d.toISOString().slice(0, 10); }
function prefix(slug) { let h = 0; for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'sk_live_' + (h % 65536).toString(16).padStart(4, '0'); }

export const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-00000000d3a0';

/** Demo rows in Supabase table shape. */
export function demoRows(now = Date.now(), wsId = DEMO_WORKSPACE_ID) {
  const bots = BOTS.map(([slug, name, role, emoji, activity, doing, team], i) => ({
    id: 'demo-bot-' + slug, workspace_id: wsId, slug, name, role, emoji, activity, doing,
    last_heartbeat: new Date(now - (HB_SECONDS[slug] || 600) * 1000).toISOString(),
    key_prefix: prefix(slug), revoked_at: null, created_at: new Date(now - 864e5 * 3 + i * 6e4).toISOString(), team,
  }));
  const missions = MISSIONS.map(([slug, name, sort]) => ({ id: 'demo-m-' + slug, workspace_id: wsId, slug, name, sort }));
  const tasks = TASKS.map(([slug, mission_slug, title, owner_bot, helpers, status, progress, dueDays, note]) => ({
    id: 'demo-t-' + slug, workspace_id: wsId, slug, mission_slug, title, owner_bot, helpers, status, progress,
    due: dueDays == null ? null : isoDay(new Date(now + dueDays * 864e5)), note, updated_at: new Date(now - 6e4).toISOString(),
  }));
  const messages = MSGS.map(([min, from_bot, to_bot, text], i) => ({ id: i + 1, workspace_id: wsId, from_bot, to_bot, text, created_at: new Date(now - min * 6e4).toISOString() }));
  return { bots, missions, tasks, messages };
}

/** Lines the simulator can send (still fictional). */
export const SIM_LINES = [
  ['writer', 'lead', 'First draft of the weekly update is ready'],
  ['lead', 'research', 'Any update on the tool comparison?'],
  ['research', 'lead', 'Comparison done, table is in the doc'],
  ['calendar', 'lead', 'Team sync booked for Thursday 10:00'],
  ['code', 'lead', 'Sign-in fix is ready for review'],
  ['lead', 'code', 'Looks good, please ship it'],
  ['support', 'mailbot', 'Both customer questions answered'],
  ['mailbot', 'lead', 'Inbox is down to five unread'],
];
export const SIM_DOING = {
  mailbot: ['Sorting new email into folders', 'Flagging urgent threads'],
  research: ['Comparing three project tools', 'Reading pricing pages', 'Summarising reviews'],
  calendar: ['Waiting for replies to a meeting invite', 'Checking free slots'],
  code: ['Fixing a sign-in bug', 'Writing a test for the fix', 'Opening a pull request'],
  writer: ['Reading notes for the weekly update', 'Drafting the weekly update', 'Tightening the intro'],
  support: ['Answering a customer question', 'Updating a help article'],
};

/** Extra fictional bots for QA scenes (?mock=1&bots=N): numbered helpers spread over the demo teams and General. */
export function extraBots(n, now = Date.now(), wsId = DEMO_WORKSPACE_ID) {
  const teams = ['Admin', 'Content', 'Build', null], out = [];
  for (let k = 1; k <= n; k++) {
    const slug = 'helper-' + k;
    out.push({ id: 'demo-bot-' + slug, workspace_id: wsId, slug, name: 'Helper Bot ' + k, role: 'Helper', emoji: '🤖', activity: k % 3 ? 'typing' : 'idle', doing: k % 3 ? 'Helping out' : '',
      last_heartbeat: new Date(now - 30e3).toISOString(), key_prefix: prefix(slug), revoked_at: null, created_at: new Date(now - 864e5 * 2 + k * 6e4).toISOString(), team: teams[k % teams.length] });
  }
  return out;
}
