/* Landing / sign-in (mockup 01) with a clearly labelled DEMO office drawn from fictional data. */
import { esc, ICON, toast } from '../util.js';
import { createOffice } from '../office.js';
import { WorkspaceRows } from '../data/model.js';
import { create as createDemoSource } from '../data/mock.js';
import { MOCK, providers } from '../data/index.js';

export async function renderLanding(el, { backend, focusSignIn, notice }) {
  const pv = providers();
  const oauth = (pv.google ? '<button class="oauth g" type="button" data-oauth="google">' + ICON.google + 'Continue with Google</button>' : '') +
    (pv.github ? '<button class="oauth gh" type="button" data-oauth="github">' + ICON.github + 'Continue with GitHub</button>' : '');
  const anyOauth = pv.google || pv.github;
  el.innerHTML = '<div class="landing"><div class="wrap lw"><header class="top"><div class="brand"><span class="logo" aria-hidden="true">🏢</span><h1>Swarm HQ</h1></div><nav class="lnav"><a href="#how" data-scroll="how">How it works</a><button class="btn" type="button" id="navsignin">Sign in</button></nav></header>' +
    '<section class="heroL v2"><div class="pitch"><span class="eyebrow mono"><i></i>YOUR BOTS, AT WORK</span><h2 class="big">See what your AI bots are doing, live, in a tiny pixel office.</h2>' +
    '<p class="lead">Every bot gets a desk. Watch them type, browse, read and hand work to each other, with each task\'s progress right beside them.</p>' +
    '<form class="signin" id="signin" novalidate><label class="fld"><span>Email</span><input id="email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required></label>' +
    '<button class="btn pri mlb" type="submit" id="emailbtn">' + ICON.mail + 'Email me a magic link</button>' +
    '<p class="hint">' + (MOCK ? '<b>Mock mode:</b> no email is sent; you\'ll enter a fictional demo workspace.' : 'No password needed. We\'ll email you a one-time sign-in link.') + '</p>' +
    '<p class="formmsg" id="formmsg" role="status" aria-live="polite"></p>' +
    (anyOauth ? '<div class="or" aria-hidden="true">or</div>' + oauth : '') + '</form>' +
    '<p class="fine">Your office is private. People you invite sign in to watch; a read-only link stays off unless you turn it on.</p></div>' +
    '<figure class="preview panel" aria-label="Demo office preview"><div class="chrome"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="url mono">anuppurohit1992.github.io/swarm-hq/#/demo</span><span class="demopill">Demo office</span></div>' +
    '<div class="office"><div class="stage" id="stage"><canvas id="cv" aria-hidden="true"></canvas><div id="ov"></div><div class="bub msg" id="mbub" hidden aria-hidden="true"></div><div class="bub" id="hbub" hidden role="status"></div></div></div>' +
    '<figcaption>Demo office: sample bots, tasks and messages, not a real workspace. <a href="#/demo">Open the full demo →</a></figcaption></figure></section>' +
    '<section id="how" class="how" aria-labelledby="h-how"><h2 id="h-how">How it works</h2><ol class="steps">' +
    '<li><span class="num mono">1</span><div><b>Sign in and name your office</b><p>Use an email magic link' + (anyOauth ? ', ' + [pv.google && 'Google', pv.github && 'GitHub'].filter(Boolean).join(' or ') : '') + '. You get a private workspace with empty desks.</p></div></li>' +
    '<li><span class="num mono">2</span><div><b>Connect your bots</b><p>Each bot gets its own API key and reports its activity, tasks and messages with one HTTPS call.</p></div></li>' +
    '<li><span class="num mono">3</span><div><b>Watch them work</b><p>Desks animate in real time, envelopes fly between bots and progress bars fill up.</p></div></li></ol></section>' +
    '<footer class="lf">Swarm HQ · <a href="https://github.com/anuppurohit1992/swarm-hq">source on GitHub</a></footer></div></div>';

  // Demo office preview: fictional rows + the mock simulator.
  const demo = createDemoSource(); const rows = new WorkspaceRows(await demo.loadRows('ws-demo'));
  const office = createOffice(el.querySelector('.preview'), { data: rows.status(), live: null });
  const unsub = demo.subscribe('ws-demo', { onEvent: e => { if (rows.apply(e)) office.setData(rows.status()); }, onStatus: () => {} });

  const form = el.querySelector('#signin'), msg = el.querySelector('#formmsg'), input = el.querySelector('#email'), btn = el.querySelector('#emailbtn');
  if (notice) { msg.textContent = notice; msg.className = 'formmsg err'; }
  form.addEventListener('submit', async e => {
    e.preventDefault(); const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Enter a valid email address.'; msg.className = 'formmsg err'; input.focus(); return; }
    btn.disabled = true; msg.textContent = 'Sending…'; msg.className = 'formmsg';
    try { const r = await backend.signInWithEmail(email); msg.textContent = r.message; msg.className = 'formmsg ok'; if (r.instant) toast(r.message); }
    catch (err) { msg.textContent = err.message || 'Sign-in failed'; msg.className = 'formmsg err'; }
    finally { btn.disabled = false; }
  });
  el.querySelectorAll('[data-oauth]').forEach(b => b.addEventListener('click', async () => {
    try { await backend.signInWithOAuth(b.dataset.oauth); } catch (err) { msg.textContent = err.message; msg.className = 'formmsg err'; }
  }));
  el.querySelector('#navsignin').addEventListener('click', () => { input.scrollIntoView({ block: 'center' }); input.focus(); });
  el.querySelector('[data-scroll]').addEventListener('click', e => { e.preventDefault(); el.querySelector('#how').scrollIntoView({ behavior: 'smooth' }); });
  if (focusSignIn) input.focus();
  return () => { unsub(); office.destroy(); };
}
