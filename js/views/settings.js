/* Settings / Connect your bots — FINAL mockup 05 v3: per-bot keys (prefix only, Rotate / Revoke / Remove),
   invite by email, read-only link OFF by default, 7-day history, report snippet, typed-name delete. Owner only. */
import { esc, ICON, ACTS, actChip, ago, isFresh, copyText, toast } from '../util.js';
import { WorkspaceRows } from '../data/model.js';
import { reportUrl, siteUrl } from '../data/index.js';
import { openCreateBot, showKeyDialog } from './dialogs.js';

const ROT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';

function snippet(kind, url) {
  const body = { activity: 'browsing', doing: 'Researching project tools', tasks: [{ id: 'compare-tools', progress: 60, status: 'in_progress' }], message: { to: 'lead', text: 'First pass done: 3 tools rated' } };
  const json = JSON.stringify(body, null, 2);
  const hl = s => esc(s).replace(/(&quot;[a-z_]+&quot;)(\s*:)/g, '<span class="c-key">$1</span>$2').replace(/:\s(&quot;.*?&quot;)/g, ': <span class="c-str">$1</span>').replace(/:\s(\d+)/g, ': <span class="c-num">$1</span>');
  if (kind === 'curl') return '<span class="c-cmd">curl</span> -X POST <span class="c-url">' + esc(url) + '</span> \\\n  -H <span class="c-str">"x-api-key: $BOT_KEY"</span> \\\n  -H <span class="c-str">"Content-Type: application/json"</span> \\\n  -d <span class="c-str">\'</span>' + hl(json).replace(/\n/g, '\n  ') + '<span class="c-str">\'</span>\n<span class="c-com"># → 200 {"ok": true}   No bot field in the body: the key says which bot is reporting.</span>';
  if (kind === 'py') return '<span class="c-cmd">import</span> os, requests\n\nrequests.post(\n    <span class="c-url">"' + esc(url) + '"</span>,\n    headers={<span class="c-str">"x-api-key"</span>: os.environ[<span class="c-str">"BOT_KEY"</span>]},\n    json=' + hl(json.replace(/\n/g, '\n    ')) + ',\n    timeout=10,\n).raise_for_status()  <span class="c-com"># → {"ok": true}</span>';
  return '<span class="c-cmd">await</span> fetch(<span class="c-url">"' + esc(url) + '"</span>, {\n  method: <span class="c-str">"POST"</span>,\n  headers: { <span class="c-str">"x-api-key"</span>: process.env.BOT_KEY, <span class="c-str">"Content-Type"</span>: <span class="c-str">"application/json"</span> },\n  body: JSON.stringify(' + hl(json.replace(/\n/g, '\n  ')) + '),\n});  <span class="c-com">// → {"ok": true}</span>';
}
function plainSnippet(kind, url) { const d = document.createElement('div'); d.innerHTML = snippet(kind, url); return d.textContent; }

export async function renderSettings(el, { backend, workspace, headerHtml, wire, openAdd, onDeleted }) {
  const ws = workspace; let rows = null, members = [], share = { share_enabled: false, share_token: null }, tab = 'curl', busy = false, rotated = '';
  el.innerHTML = '<div class="wrap">' + headerHtml() + '<p class="empty loading">Loading settings…</p></div>';
  const unwire = wire ? wire(el) : null;
  try {
    const [r, m, s] = await Promise.all([backend.loadRows(ws.id), backend.listMembers(ws.id), backend.getShare(ws.id)]);
    rows = new WorkspaceRows(r); members = m; share = s || share;
  } catch (e) { el.querySelector('.loading').outerHTML = '<div class="panel card errbox"><h3>Couldn\'t load settings</h3><p class="hint">' + esc(e.message) + '</p></div>'; return () => { unwire && unwire(); }; }
  const addr = siteUrl() + '#/w/' + encodeURIComponent(ws.slug);
  const shareUrl = () => siteUrl() + '#/w/' + encodeURIComponent(ws.slug) + '/view?k=' + (share.share_token ? encodeURIComponent(share.share_token) : '…');

  function botRows() {
    const bots = rows.rows.bots.slice().sort((a, b) => ((!!a.revoked_at) - (!!b.revoked_at)) || ((a.activity === 'idle') - (b.activity === 'idle')) || String(a.created_at).localeCompare(String(b.created_at)));
    if (!bots.length) return '<tr><td colspan="5" class="empty">No bots yet. Add one to get its key.</td></tr>';
    return bots.map(b => {
      const n = esc(b.name), fresh = !b.revoked_at && isFresh(b.last_heartbeat), a = ACTS[b.activity] ? b.activity : 'idle', rv = !!b.revoked_at;
      return '<tr data-bot="' + esc(b.id) + '" class="' + (rotated === b.id ? 'rot' : '') + (rv ? ' rvkrow' : '') + '"><td><span class="nmc"><span class="av" aria-hidden="true">' + esc(b.emoji || '🤖') + '</span><span><b>' + n + '</b><small>' + esc(b.slug) + (b.role ? ' · ' + esc(b.role) : '') + '</small></span></span></td>' +
        '<td><span class="hbc' + (fresh ? ' fresh' : '') + '"><i></i>' + (b.last_heartbeat ? esc(ago(b.last_heartbeat)) : 'Never') + '</span></td>' +
        '<td>' + (rv ? '<span class="chip s-bad">Key revoked</span>' : actChip(a)) + '</td>' +
        '<td><span class="kc"><code class="kpre" title="Key prefix. Only a hash of the key is stored.">' + esc(b.key_prefix || 'sk_live_') + '…</code>' +
        (rotated === b.id ? '<span class="newk">new</span>' : '') +
        '<button class="btn xs rt" type="button" data-k="rotate" aria-label="Rotate key for ' + n + '">' + ROT + 'Rotate</button>' +
        (rv ? '' : '<button class="btn xs rv" type="button" data-k="revoke" aria-label="Revoke key for ' + n + '">Revoke</button>') + '</span></td>' +
        '<td><button class="btn xs ic rmb" type="button" data-k="remove" aria-label="Remove ' + n + '" title="Remove bot">' + ICON.trash + '</button></td></tr>';
    }).join('');
  }
  function memberList() {
    return members.map(m => {
      const status = m.accepted_at ? (m.is_you ? 'Signed in' : 'Joined') : 'Invite pending';
      return '<li><span class="ava sm' + (m.accepted_at ? '' : ' g') + '" aria-hidden="true">' + esc((m.email || '?')[0].toUpperCase()) + '</span><div><b class="' + (m.is_you ? '' : 'mono') + '">' + esc(m.email) + '</b>' + (m.is_you ? ' <span class="you">you</span>' : '') + '</div>' +
        '<span class="chip ' + (m.role === 'owner' ? 's-run' : 's-mute') + '">' + (m.role === 'owner' ? 'Owner' : 'Viewer') + '</span><span class="ms">' + status + '</span>' +
        (m.role !== 'owner' ? '<button class="btn xs" type="button" data-rm="' + esc(m.email) + '">Remove</button>' : '<span></span>') + '</li>';
    }).join('');
  }
  function render() {
    const y = scrollY;
    el.innerHTML = '<div class="wrap">' + headerHtml() + '<div class="setgrid"><nav class="panel snav" aria-label="Settings sections">' +
      [['ws', 'Workspace'], ['share', 'Members &amp; sharing'], ['bots', 'Bots &amp; keys'], ['snip', 'Report snippet']].map(([id, l], i) => '<a href="#" data-go="' + id + '"' + (i === 0 ? ' class="on"' : '') + '>' + l + '</a>').join('') +
      '<a href="#" class="dz" data-go="danger">Danger zone</a><a class="back" href="#/w/' + encodeURIComponent(ws.slug) + '">← Back to office</a></nav><main class="scol">' +
      '<div class="sh1"><h2 class="pt">Connect your bots</h2><p class="sub">Settings for <b>' + esc(ws.name) + '</b>. Each bot reports with its own key; invited members sign in to watch.</p></div>' +
      '<section class="panel card" id="ws"><div class="ch"><h3>Workspace</h3></div><form id="wsform"><label class="fld"><span>Workspace name</span><span class="inrow"><input name="name" value="' + esc(ws.name) + '" maxlength="80" aria-label="Workspace name" required><button class="btn" type="submit">Save</button></span></label></form>' +
      '<p class="hint">Address <span class="mono">' + esc(addr) + '</span> · hosted on GitHub Pages</p>' +
      '<div class="rorow"><span class="roi" aria-hidden="true">' + ICON.lock + '</span><div><b>Message history</b><p class="hint">Kept for 7 days. Older comms log messages are deleted automatically.</p></div><span class="chip s-mute">7 days</span></div></section>' +
      '<section class="panel card" id="share"><div class="ch"><h3>Members &amp; sharing</h3></div><form id="invform" novalidate><label class="fld"><span>Invite by email</span><span class="inrow"><input name="email" type="email" placeholder="name@example.com" aria-label="Email to invite" autocomplete="off" required><span class="sel2" aria-label="Role">Viewer</span><button class="btn pri" type="submit">Invite</button></span></label></form>' +
      '<p class="hint">Invitees must sign in with that email to view (no email is sent; share the site link with them). Viewers can watch the office, tasks and comms log but can\'t change anything.</p><ul class="mem">' + memberList() + '</ul>' +
      '<div class="linkoff"><div class="ch"><div><b>Read-only link</b><p class="hint">' + (share.share_enabled ? 'On: anyone with this link can watch the office without signing in. Turning it off invalidates the link.' : 'If turned on, anyone with the link could view the office without signing in.') + '</p></div>' +
      '<button class="tog" type="button" role="switch" aria-checked="' + !!share.share_enabled + '" id="sharetog" aria-label="Read-only link"><span class="sw' + (share.share_enabled ? ' on' : '') + '" aria-hidden="true"><i></i></span>' + (share.share_enabled ? 'On' : 'Off') + '</button></div>' +
      '<span class="inrow' + (share.share_enabled ? '' : ' dis') + '"><input class="mono" readonly ' + (share.share_enabled ? '' : 'disabled ') + 'value="' + esc(shareUrl()) + '" aria-label="Read-only link"><button class="btn" type="button" id="copylink"' + (share.share_enabled ? '' : ' disabled') + '>' + ICON.copy + 'Copy link</button>' +
      (share.share_enabled ? '<button class="btn" type="button" id="resetlink">Reset link</button>' : '') + '</span></div></section>' +
      '<section class="panel card" id="bots"><div class="ch"><h3>Bots &amp; keys <span class="cnt mono">' + rows.rows.bots.length + '</span></h3><div class="addb"><span class="hint">Each new bot gets its own key, shown once.</span><button class="btn pri" type="button" id="addbot">+ Add bot</button></div></div>' +
      '<div class="tw"><table class="btab k2"><thead><tr><th>Bot</th><th>Last heartbeat</th><th>Status</th><th>Key</th><th><span class="sr">Remove</span></th></tr></thead><tbody id="botrows">' + botRows() + '</tbody></table></div>' +
      '<div class="keynote"><span class="roi" aria-hidden="true">' + ICON.key + '</span><p><b>One key per bot.</b> Only a hash is stored, so a key is shown once and never again; the table shows its prefix. <b>Rotate</b> issues a new key and the old one stops working immediately. <b>Revoke</b> disconnects just that bot. <b>Remove</b> deletes the bot; its tasks become unassigned.</p></div></section>' +
      '<section class="panel card" id="snip"><div class="ch"><h3>Report status from a bot</h3><div class="tabs" role="tablist">' +
      [['curl', 'curl'], ['py', 'Python'], ['js', 'JavaScript']].map(([k, l]) => '<button role="tab" type="button" data-tab="' + k + '" aria-selected="' + (tab === k) + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="codewrap"><pre class="code" role="tabpanel"><code>' + snippet(tab, reportUrl()) + '</code></pre><button class="btn xs copycode" type="button" id="copysnip">' + ICON.copy + 'Copy</button></div>' +
      '<p class="hint">' + (reportUrl().includes('<project>') ? '<span class="mono">&lt;project&gt;</span> <span class="exd">example</span> is your Supabase project ref. ' : '') + '<span class="mono">$BOT_KEY</span> is the key of the bot that is reporting.</p>' +
      '<dl class="fref"><dt class="mono">x-api-key</dt><dd>This bot\'s own key. It identifies the bot, and each call updates its heartbeat.</dd><dt class="mono">activity</dt><dd>' + Object.keys(ACTS).map(a => '<span class="chip ac-' + a + '">' + a + '</span>').join(' ') + '</dd>' +
      '<dt class="mono">doing</dt><dd>Short text shown in the desk bubble</dd><dt class="mono">tasks[]</dt><dd><code>id</code> <code>progress</code> 0–100 <code>status</code> in_progress · waiting · done; optional <code>title</code> <code>mission</code> <code>note</code> <code>helpers</code> <code>due</code></dd>' +
      '<dt class="mono">missions[]</dt><dd><code>id</code> <code>name</code></dd><dt class="mono">message</dt><dd><code>to</code> bot id and <code>text</code>; flies as an envelope, kept 7 days</dd></dl>' +
      '<p class="hint">All fields are optional. Tasks are upserted by <code>id</code> (the task slug). Limit about 1 request per second per bot.</p></section>' +
      '<section class="panel card danger" id="danger"><div class="ch"><div><h3>Danger zone</h3><p class="hint">Delete this workspace and everything in it: bots, keys, members, missions, tasks and message history. This can\'t be undone.</p></div></div>' +
      '<label class="fld"><span>To confirm, type the workspace name <b class="tx nocap">' + esc(ws.name) + '</b></span><span class="inrow"><input id="delname" placeholder="' + esc(ws.name) + '" aria-label="Type the workspace name to confirm" autocomplete="off"><button class="btn del" type="button" id="delws" disabled>' + ICON.trash + 'Delete workspace</button></span></label><p class="hint">The button turns on once the name matches.</p></section>' +
      '</main></div></div>';
    scrollTo(0, y);
  }
  render();

  async function act(fn, ok) { if (busy) return; busy = true; try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message || 'Something went wrong', 'err'); } finally { busy = false; } }
  function addBot() {
    openCreateBot({ backend, wsId: ws.id, first: !rows.rows.bots.length, onCreated: r => { if (!rows.rows.bots.some(x => x.id === r.bot.id)) rows.apply({ table: 'bots', eventType: 'INSERT', new: { ...r.bot, workspace_id: ws.id, activity: 'idle', doing: '', last_heartbeat: null, created_at: new Date().toISOString() } }); render(); } });
  }
  const onClick = e => {
    const t = e.target.closest('button,a'); if (!t || !el.contains(t)) return;
    if (t.dataset.go) { e.preventDefault(); el.querySelectorAll('.snav a').forEach(a => a.classList.toggle('on', a === t)); el.querySelector('#' + t.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
    if (t.id === 'copysnip') { copyText(plainSnippet(tab, reportUrl())).then(ok => toast(ok ? 'Snippet copied' : 'Copy failed')); return; }
    if (t.id === 'addbot') { addBot(); return; }
    if (t.id === 'copylink') { copyText(shareUrl()).then(ok => toast(ok ? 'Link copied' : 'Copy failed')); return; }
    if (t.id === 'sharetog') { const on = !share.share_enabled; act(async () => { share = await backend.setShareLink(ws.id, on); render(); }, on ? 'Read-only link turned on' : 'Read-only link turned off'); return; }
    if (t.id === 'resetlink') { if (!confirm('Reset the read-only link? The old link stops working.')) return; act(async () => { share = await backend.setShareLink(ws.id, true, true); render(); }, 'New link created'); return; }
    if (t.dataset.rm) { const em = t.dataset.rm; if (!confirm('Remove ' + em + ' from this workspace?')) return; act(async () => { await backend.removeMember(ws.id, em); members = await backend.listMembers(ws.id); render(); }, 'Removed ' + em); return; }
    if (t.id === 'delws') { const typed = el.querySelector('#delname').value.trim(); act(async () => { await backend.deleteWorkspace(ws.id, typed); onDeleted && onDeleted(); }, 'Workspace deleted'); return; }
    const tr = t.closest('tr[data-bot]'); if (!tr || !t.dataset.k) return;
    const b = rows.rows.bots.find(x => x.id === tr.dataset.bot); if (!b) return;
    if (t.dataset.k === 'rotate') {
      if (!b.revoked_at && !confirm('Rotate the key for ' + b.name + '? The current key stops working immediately.')) return;
      act(async () => { const r = await backend.rotateBotKey(b.id); b.key_prefix = r.key_prefix; b.revoked_at = null; rotated = b.id; render(); showKeyDialog({ botName: b.name, key: r.api_key }); });
    }
    if (t.dataset.k === 'revoke') { if (!confirm('Revoke the key for ' + b.name + '? It stops reporting until you rotate it.')) return; act(async () => { await backend.revokeBotKey(b.id); b.revoked_at = new Date().toISOString(); render(); }, 'Key revoked'); }
    if (t.dataset.k === 'remove') { if (!confirm('Remove ' + b.name + '? Its desk and key are deleted and its tasks become unassigned.')) return; act(async () => { await backend.removeBot(b.id); rows.apply({ table: 'bots', eventType: 'DELETE', old: { id: b.id } }); render(); }, 'Bot removed'); }
  };
  const onSubmit = e => {
    e.preventDefault(); const f = e.target;
    if (f.id === 'wsform') { const name = f.name.value.trim(); if (!name) return; act(async () => { await backend.renameWorkspace(ws.id, name); ws.name = name; render(); }, 'Workspace renamed'); }
    if (f.id === 'invform') {
      const email = f.email.value.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address', 'err'); return; }
      act(async () => { await backend.inviteViewer(ws.id, email); members = await backend.listMembers(ws.id); render(); }, 'Invited ' + email);
    }
  };
  const onInput = e => { if (e.target.id === 'delname') el.querySelector('#delws').disabled = e.target.value.trim() !== ws.name; };
  el.addEventListener('click', onClick); el.addEventListener('submit', onSubmit); el.addEventListener('input', onInput);
  if (openAdd) { el.querySelector('#bots').scrollIntoView({ block: 'start' }); addBot(); }

  // Keep the bot table live (heartbeats, first reports, revocations from other tabs).
  let pend = 0; const redraw = () => { const tb = el.querySelector('#botrows'); if (tb && !busy) tb.innerHTML = botRows(); };
  const unsub = backend.subscribe(ws.id, { onEvent: evt => { if (evt.table !== 'bots') return; if (rows.apply(evt) && !pend) pend = setTimeout(() => { pend = 0; redraw(); }, 200); }, onStatus: () => {}, onResync: async () => { rows.set(await backend.loadRows(ws.id)); redraw(); } });
  const tick = setInterval(redraw, 15000);
  return () => { clearInterval(tick); clearTimeout(pend); unsub && unsub(); unwire && unwire(); el.removeEventListener('click', onClick); el.removeEventListener('submit', onSubmit); el.removeEventListener('input', onInput); document.querySelectorAll('.modal').forEach(m => m.remove()); document.body.classList.remove('has-modal'); };
}
