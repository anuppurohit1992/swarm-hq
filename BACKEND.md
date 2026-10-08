# What the frontend expects from Supabase

Matches `backend/supabase/migrations/*` (Swarm HQ v1). All calls are in `js/data/supabase.js`.

## Reads (RLS: accepted members can SELECT)
- `workspaces`: `id, slug, name, owner_id, share_enabled, created_at`. **Always select workspaces with these explicit columns**
  (`js/data/supabase.js` → `WS_COLS`). Never use `select('*')` or name `share_token`: column privileges hide `share_token`, so either one
  fails with *permission denied*, even for the owner.
- **`share_token` is owner-only and comes ONLY from RPCs:** `get_share_token(p_workspace_id)` → `{enabled, token}` (Settings load) and
  `set_share_link(p_workspace_id, p_enabled, p_regenerate)` → `{enabled, token}` (toggle / reset). The frontend maps both to `{share_enabled, share_token}`.
- `members` (owner sees all rows): `workspace_id, user_id, email, role, invited_at, accepted_at`
- `bots`: `id, workspace_id, slug, name, role, emoji, activity, doing, last_heartbeat, key_prefix, revoked_at, created_at`
- `missions`: `*` · `tasks`: `*` (`owner_bot` may be NULL → shown as "Unassigned") · `messages`: last 7 days, newest 500

## Realtime
One channel per open workspace, `postgres_changes` (`*`) on `bots`, `tasks`, `missions`, `messages` with
`filter: workspace_id=eq.<id>`. Status → indicator: `SUBSCRIBED` = LIVE, `CHANNEL_ERROR`/`TIMED_OUT` = Reconnecting,
`CLOSED`/browser offline = Offline. After a reconnect the app refetches everything.

## RPCs called (supabase.rpc)
| UI action | Call | Returns (used fields) |
|---|---|---|
| after every sign-in / app load with a session | `accept_pending_invites()` | int |
| first sign-in / New workspace | `create_workspace(p_name text, p_slug text)` | uuid |
| Save workspace name | `update_workspace(p_workspace_id uuid, p_name text)` | void |
| Delete workspace (typed name) | `delete_workspace(p_workspace_id uuid, p_confirm_name text)` | void |
| + Add bot | `create_bot(p_workspace_id uuid, p_slug text, p_name text, p_role text, p_emoji text)` | `{bot_id, slug, key, key_prefix}` |
| Rotate | `rotate_bot_key(p_bot_id uuid)` | `{bot_id, key, key_prefix}` |
| Revoke | `revoke_bot_key(p_bot_id uuid)` | void |
| Remove bot | `remove_bot(p_bot_id uuid)` | void |
| Invite | `invite_member(p_workspace_id uuid, p_email text, p_role text = 'viewer')` | `{email, role, invited_at, accepted_at}`. Sends no email: Settings shows a 'Copy invite link' hint (site URL) |
| Remove member | `remove_member(p_workspace_id uuid, p_email text)` | void |
| Settings load (owner) | `get_share_token(p_workspace_id uuid)` | `{enabled, token}` |
| Read-only link toggle / Reset link | `set_share_link(p_workspace_id uuid, p_enabled bool, p_regenerate bool)` | `{enabled, token}` |
| Open `#/w/<slug>/view?k=<token>` or `#share=<token>` | `get_shared_workspace(p_token text)` (anon) | `{workspace, bots, missions, tasks, messages}`; polled every 15 s |

Errors raised as `swarm:<status>:<code>` are mapped to friendly messages.

## Auth
Email magic link via `signInWithOtp` (implicit flow, `emailRedirectTo = SITE_URL`). Google/GitHub via
`signInWithOAuth` only when `oauth.google` / `oauth.github` are `true` in `config.js`.
