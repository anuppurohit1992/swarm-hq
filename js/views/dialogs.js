/* One-time key dialogs (mockups 05 v3 + 06 v2): create bot → key shown once; rotate → new key shown once. */
import { esc, ICON, copyText, toast, slugify } from '../util.js';

const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>';
const EMOJIS = ['🤖', '🔎', '✍️', '📬', '📅', '💻', '🎧', '🎨', '📊', '🧪', '🛒', '🎯'];

function modal(inner, { wide = false, onClose } = {}) {
  const prevFocus = document.activeElement;
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = '<div class="dlg' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="dlg-t">' + inner + '</div>';
  document.body.appendChild(wrap); document.body.classList.add('has-modal');
  let closed = false;
  const close = () => { if (closed) return; closed = true; wrap.remove(); document.body.classList.remove('has-modal'); removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); onClose && onClose(); };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') { const f = Array.from(wrap.querySelectorAll('button:not([disabled]),input:not([disabled]),select,a[href]')); if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  };
  addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el: wrap, close };
}
function keyBlock(name, key, lost = true) {
  return '<label class="fld"><span>API key for ' + esc(name) + '</span><span class="inrow"><input class="mono keyfull" readonly value="' + esc(key) + '" aria-label="New API key" id="dlgkey"><button class="btn" type="button" id="dlgcopy">' + ICON.copy + 'Copy</button></span></label>' +
    '<div class="warnbox"><span aria-hidden="true">' + WARN + '</span><p><b>This is the only time you\'ll see this key.</b> Store it in your bot\'s secrets and send it as the <code>x-api-key</code> header.' + (lost ? ' Lost it? Rotate it in Settings to get a new one.' : '') + '</p></div>';
}
function wireCopy(el, key) {
  const inp = el.querySelector('#dlgkey'); inp.addEventListener('focus', () => inp.select());
  el.querySelector('#dlgcopy').addEventListener('click', async () => { const ok = await copyText(key); toast(ok ? 'Key copied' : 'Copy failed; select the key and copy it manually', ok ? '' : 'err'); });
}

/** Shows a just-issued key once (after Rotate). */
export function showKeyDialog({ botName, key, rotated = true }) {
  const m = modal('<div class="dlgh"><span class="roi" aria-hidden="true">' + ICON.key + '</span><div><h4 id="dlg-t">New key for ' + esc(botName) + '</h4><p class="hint">' + (rotated ? 'Rotated just now. The previous key stopped working immediately.' : 'Issued just now.') + '</p></div><button class="icon" type="button" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    keyBlock(botName, key, false) + '<div class="dlgf"><span class="hint">Lost it later? Rotate again to get a new one.</span><button class="btn pri" type="button" data-close>Done</button></div>');
  wireCopy(m.el, key); m.el.querySelector('#dlgcopy').focus();
  return m;
}

/** Create-bot dialog: name, role, emoji → create_bot → key shown once. */
export function openCreateBot({ backend, wsId, first = false, teams = [], onCreated, onClose }) {
  let emoji = EMOJIS[0], done = false;
  const m = modal('<div class="dlgh"><span class="roi" aria-hidden="true">' + ICON.key + '</span><div><h4 id="dlg-t">' + (first ? 'Add your first bot' : 'Add a bot') + '</h4><p class="hint">Give it a name, a role and an emoji. It gets its own API key, shown once.</p></div><button class="icon" type="button" data-close aria-label="Close">' + ICON.close + '</button></div>' +
    '<form id="cbform" novalidate><div class="frow"><label class="fld"><span>Name</span><input name="name" required maxlength="60" placeholder="Research Bot" autocomplete="off"></label><label class="fld"><span>Role</span><input name="role" maxlength="80" placeholder="Web research" autocomplete="off"></label></div>' +
    '<label class="fld"><span>Bot id <span class="hint nocap">used in <code>message.to</code> and task <code>helpers</code></span></span><input name="slug" class="mono" maxlength="32" placeholder="research-bot" autocomplete="off"></label>' +
    '<label class="fld"><span>Team <span class="hint nocap">optional · bots with the same team share a zone in the office; blank = General</span></span><input name="team" list="cbteams" maxlength="40" placeholder="General" autocomplete="off"><datalist id="cbteams">' + teams.map(t => '<option value="' + esc(t) + '">').join('') + '</datalist></label>' +
    '<div class="fld"><span>Emoji</span><div class="emo" role="radiogroup" aria-label="Emoji">' + EMOJIS.map((e, i) => '<button type="button" role="radio" aria-checked="' + (i === 0) + '"' + (i === 0 ? ' class="on"' : '') + ' data-emo="' + e + '">' + e + '</button>').join('') + '</div></div>' +
    '<p class="formmsg err" id="cberr" role="alert"></p><div class="dlgf"><span class="hint">The key appears once, right after you create the bot.</span><button class="btn pri" type="submit" id="cbgo">Create bot</button></div></form><div id="cbout"></div>',
    { wide: true, onClose: () => onClose && onClose(done) });
  const f = m.el.querySelector('#cbform'), err = m.el.querySelector('#cberr');
  f.name.focus();
  f.addEventListener('input', e => { if (e.target.name === 'name' && !f.slug.dataset.touched) f.slug.value = slugify(e.target.value).slice(0, 32); if (e.target.name === 'slug') f.slug.dataset.touched = '1'; });
  m.el.querySelectorAll('[data-emo]').forEach(b => b.addEventListener('click', () => { emoji = b.dataset.emo; m.el.querySelectorAll('[data-emo]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); }));
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const name = f.name.value.trim(), role = f.role.value.trim(), team = f.team.value.trim(), slug = slugify(f.slug.value || name).slice(0, 32);
    if (!name) { err.textContent = 'Give the bot a name.'; f.name.focus(); return; }
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(slug)) { err.textContent = 'The bot id can use lowercase letters, numbers, - and _.'; f.slug.focus(); return; }
    const go = m.el.querySelector('#cbgo'); go.disabled = true; go.textContent = 'Creating…';
    try {
      const r = await backend.createBot(wsId, { slug, name, role, emoji, team }); done = true;
      f.querySelectorAll('input,button').forEach(x => { x.disabled = true; }); f.querySelector('.dlgf').remove();
      m.el.querySelector('#cbout').innerHTML = '<div class="created"><span class="okdot" aria-hidden="true">✓</span><b>' + esc(name) + ' created.</b> <span class="hint">Its desk lights up after its first report.</span></div>' + keyBlock(name, r.api_key) +
        '<div class="dlgf"><span class="hint">Next: paste the report snippet into your bot.</span><button class="btn pri" type="button" data-close>Done</button></div>';
      m.el.querySelector('#cbout [data-close]').addEventListener('click', m.close);
      wireCopy(m.el, r.api_key); m.el.querySelector('#dlgcopy').focus();
      onCreated && onCreated(r);
    } catch (ex) { err.textContent = ex.message || 'Could not create the bot'; go.disabled = false; go.textContent = 'Create bot'; }
  });
  return m;
}
