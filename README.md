# Swarm HQ

See what your AI bots are doing, live, in a tiny pixel office.

**Live:** https://anuppurohit1992.github.io/swarm-hq/ · **Demo office (fictional data):** https://anuppurohit1992.github.io/swarm-hq/#/demo

Static single-page app (plain ES modules, no build step) served by GitHub Pages from the `main` branch root.
Backend: Supabase (Postgres + Auth + Realtime + the `report` edge function).

## Screens (hash routes)

| Route | Screen |
|---|---|
| `#/` | Landing + sign-in (email magic link first; Google/GitHub only when enabled in `config.js`) with a demo office preview |
| `#/demo` | Full demo office, fictional data, simulated updates, no sign-in |
| `#/w/<slug>` | Live office: HUD with LIVE / connection state, pixel office, comms log, missions. Tap a desk to open the bot drawer **and** filter missions to that bot |
| `#/w/<slug>` (no bots) | Empty-office onboarding: "Add your first bot" opens the create dialog, which shows the key once |
| `#/w/<slug>/settings` | Owner only: workspace name, members & invites, read-only link (off by default), bots & keys (prefix, Rotate, Revoke, Remove), report snippet, delete workspace |
| `#/w/<slug>/view?k=<token>` | Read-only share link (only works while the owner has it turned on) |

## Configuration (`config.js`)

`config.js` holds **public** values only. With `SUPABASE_URL` / `SUPABASE_ANON_KEY` empty the app runs in **mock mode**
(fictional data, simulated updates, nothing saved). `?mock=1` forces mock mode at any time.

```js
window.SWARM_CONFIG = {
  SUPABASE_URL: 'https://<project>.supabase.co',
  SUPABASE_ANON_KEY: '<anon / publishable key>',   // public by design; RLS protects data
  SITE_URL: 'https://anuppurohit1992.github.io/swarm-hq/',
  oauth: { google: false, github: false },          // buttons stay hidden until true
};
```

Never commit a service-role key or any other secret. In Supabase → Auth → URL configuration, set the Site URL and add
`https://anuppurohit1992.github.io/swarm-hq/` to the redirect allow-list.

## Code map

- `js/data/` – the only place that talks to a backend. `index.js` picks `mock.js` or `supabase.js` (same interface); `model.js` maps table rows to the office model; `demo-data.js` is the fictional demo.
- `js/office.js` – the approved pixel-office renderer as a re-feedable ES module.
- `js/views/` – landing, office (+ drawer), settings, dialogs, header.
- `vendor/supabase-js-2.117.3/` – pinned, vendored supabase-js UMD build (MIT), loaded only in live mode.
- `BACKEND.md` – the RPCs, tables and realtime events the frontend relies on.

## Bot report API

```bash
curl -X POST https://<project>.supabase.co/functions/v1/report \
  -H "x-api-key: $BOT_KEY" -H "Content-Type: application/json" \
  -d '{"activity":"browsing","doing":"Researching","tasks":[{"id":"t1","progress":60,"status":"in_progress"}]}'
```

The key identifies the bot (no `bot` field in the body). Keys are shown once at creation / rotation; only a hash is stored.

## Local development

```bash
python3 -m http.server 8000   # then open http://localhost:8000/?mock=1#/
```
