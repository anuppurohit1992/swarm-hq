/* Bot details drawer (desktop right drawer / mobile bottom sheet, mockups 03 + 04b). */
import { esc, ICON, actChip, ago, isFresh, hhmm, TZ_LABEL } from '../util.js';
import { involves, drawSprite } from '../office.js';

export function drawerMarkup() {
  return '<div class="spot" id="spot" aria-hidden="true" hidden></div>' +
    '<aside class="drawer" id="drawer" role="dialog" aria-modal="false" aria-labelledby="dname" hidden><div class="handle" aria-hidden="true"></div>' +
    '<div class="dh"><span class="k">Bot details</span><button class="icon" type="button" id="dclose" aria-label="Close details">' + ICON.close + '</button></div><div class="db" id="db"></div></aside>';
}

export function createDrawer(root, office, { onClose } = {}) {
  const el = root.querySelector('#drawer'), db = root.querySelector('#db'), spot = root.querySelector('#spot');
  let id = '', allMsgs = false, opener = null;
  function render() {
    if (!id) return;
    const M = office.model, b = M.BY[id]; if (!b) { close(); return; }
    const ts = M.tasks.filter(t => involves(t, id)), ms = M.msgs.filter(m => m.from === id || m.to === id).slice().reverse();
    const hb = b.hb ? (isFresh(b.hb) ? '<span class="hb"><i></i>Active ' + esc(ago(b.hb)) + '</span>' : '<span class="hb stale"><i></i>Last seen ' + esc(ago(b.hb)) + '</span>') : '<span class="hb stale"><i></i>No report yet</span>';
    const scroll = db.scrollTop;
    db.innerHTML =
      '<div class="dhero"><div class="bigava" aria-hidden="true">' + esc(b.emoji) + '</div><div class="spr"><canvas id="spr" aria-hidden="true"></canvas></div><div class="hi"><p class="bn" id="dname">' + esc(b.name) + '</p><p class="role">' + esc(b.role) + '</p><p class="bid mono">id: ' + esc(b.id) + '</p></div></div>' +
      (b.revoked ? '<div class="nowc rvkc"><div class="nrow"><span class="chip s-bad">Key revoked</span>' + hb + '</div><p class="doing">This bot\'s key was revoked, so it can\'t report. The owner can Rotate it in Settings to issue a new key.</p></div>'
        : '<div class="nowc"><div class="nrow">' + actChip(b.act) + hb + '</div><p class="doing">' + esc(b.doing || b.role || 'No details yet') + '</p></div>') +
      '<h3 class="sh">Tasks <span class="mono">' + ts.length + '</span></h3>' + (ts.length ? '<ul class="tasks">' + ts.map(t => office.taskLi(t, id)).join('') + '</ul>' : '<p class="empty">No tasks assigned.</p>') +
      '<h3 class="sh">Recent messages <span class="mono">' + ms.length + '</span></h3>' + (ms.length ? '<ol class="dm' + (allMsgs ? ' all' : '') + '">' + ms.map(m => {
        const out = m.from === id, o = office.bot(out ? m.to : m.from);
        return '<li><span class="dir ' + (out ? 'out' : 'in') + '">' + (out ? 'OUT' : 'IN') + '</span><div><p class="mt"><b>' + (out ? 'To ' : 'From ') + esc(o.emoji + ' ' + o.name) + '</b><time class="mono">' + hhmm(m.ts) + ' ' + esc(TZ_LABEL) + '</time></p><p>' + esc(m.text) + '</p></div></li>';
      }).join('') + '</ol>' + (ms.length > 1 && !allMsgs ? '<button class="btn more" type="button" id="dmore">View all ' + ms.length + ' messages</button>' : '') : '<p class="empty">No messages yet.</p>');
    db.scrollTop = scroll;
    drawSprite(db.querySelector('#spr'), { ...b });
    const more = db.querySelector('#dmore'); if (more) more.onclick = () => { allMsgs = true; render(); };
    placeSpot();
  }
  function placeSpot() {
    if (!id) { spot.hidden = true; return; }
    const d = office.deskEl(id); if (!d) { spot.hidden = true; return; }
    const r = d.getBoundingClientRect(); spot.hidden = false;
    spot.style.left = r.left + scrollX + 'px'; spot.style.top = r.top + scrollY + 'px'; spot.style.width = r.width + 'px'; spot.style.height = r.height + 'px';
  }
  function open(botId, fromEl) {
    const switching = !!id; id = botId; allMsgs = false; opener = fromEl || opener; el.hidden = false; document.body.classList.add('has-drawer');
    render(); if (!switching) db.scrollTop = 0;
    if (innerWidth <= 760) { const d = office.deskEl(id); if (d) { window.scrollTo(0, d.getBoundingClientRect().top + scrollY - 14); placeSpot(); } }
    root.querySelector('#dclose').focus({ preventScroll: true });
  }
  function close() {
    if (!id) return; id = ''; el.hidden = true; spot.hidden = true; document.body.classList.remove('has-drawer');
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); opener = null; onClose && onClose();
  }
  root.querySelector('#dclose').addEventListener('click', close);
  const onKey = e => { if (e.key === 'Escape' && id) close(); };
  const onRe = () => placeSpot();
  document.addEventListener('keydown', onKey); addEventListener('resize', onRe); addEventListener('scroll', onRe, { passive: true });
  const tick = setInterval(() => { if (id) { const hbEl = db.querySelector('.hb'); const b = office.model.BY[id]; if (hbEl && b && b.hb) hbEl.innerHTML = '<i></i>' + (isFresh(b.hb) ? 'Active ' : 'Last seen ') + esc(ago(b.hb)); } }, 5000);
  return {
    open, close, render, placeSpot, get id() { return id; },
    destroy() { clearInterval(tick); document.removeEventListener('keydown', onKey); removeEventListener('resize', onRe); removeEventListener('scroll', onRe); document.body.classList.remove('has-drawer'); },
  };
}
