# Live Share (Pull-Based) — Design Addendum

Additive design for hosting shops live alongside the existing file export/import flow. Nothing below removes or changes existing behavior — a DM or table that never touches "Go Live" sees the extension exactly as it works today.

## Core principle

Live Share is a **transport**, not a schema change. The same `Shop` JSON already validated by `parseAndValidateShopFile()` gets pushed over a small relay instead of (or in addition to) a downloaded file. `schema.js` and `validator.js` are untouched.

## New concepts

**Session** — a hosted shop, identified by:
- `sessionId` — short, shareable room code (e.g. 6–8 char slug)
- `writeToken` — a secret only the hosting DM's install holds, required to publish updates
- `shopId` — the underlying Shop's own `id`, unchanged
- `updatedAt` — bumped by the relay on every publish, used by joiners to detect a change cheaply

The relay itself only needs two operations:
- `GET /sessions/{sessionId}` → `{ shop, updatedAt }` or 404
- `PUT /sessions/{sessionId}` with `writeToken` → upserts `{ shop, updatedAt }`

Any JSON-over-HTTP store works — Firebase Realtime Database's REST interface, a Cloudflare Worker + KV, or a stub you run locally during development. Because it's just `fetch()` calls, it works within your current CSP (`script-src 'self'`) without pulling in an SDK/bundler — you'd only need to widen `connect-src` to the relay's domain.

## DM (host) flow

In the Creation Interface, next to the existing Export button:

- **Go Live** — generates `sessionId` + `writeToken` (once per shop), does an initial publish, shows the room code with a copy button
- **Publish Update** — replaces Go Live once a session exists; manual, like Export, so edits don't spam the relay on every keystroke
- **End Live Session** — deletes/deactivates the session on the relay; the room code stops resolving for anyone still polling it

This mirrors the existing Export mental model: two independent "ship it" actions (download a file / push to the relay) a DM can use one, the other, or both of, for the same shop.

## Player (join) flow

In the Regular Interface, next to the existing Import Shop(s):

- **Join Live Session** — enter a room code once; does an initial `GET`, adds the shop as a tab exactly like an import, tagged `source: "session"`
- Each session-sourced tab shows a small live indicator and "synced Xm ago"
- **Refresh Now** — manual on-demand check, bypasses the poll interval
- Background polling (below) keeps it current without the player doing anything

## Keeping it current without the popup open

`chrome.alarms` wakes the existing `background.js` periodically (Chrome enforces a ≥1 minute floor on alarms in production). On each wake:

1. Read the joined-sessions list from `chrome.storage.local`
2. `GET` each session, compare `updatedAt` against what's stored
3. On a change, pull the new Shop JSON, `State.upsertShopTab()` it exactly like a re-uploaded file, and set the toolbar badge (e.g. "●") so the player notices next time they glance at the icon
4. Popup, when opened, just renders storage — no live connection to manage there

This gets "don't have to reopen and re-check" without touching MV3's trickier persistent-connection story (no `chrome.offscreen`, no WebSocket lifecycle).

## Storage schema additions (`state.js`)

```
tabs[shopId] = {
  shop,
  hidden,
  loadOrder,
  source: "file" | "session",   // NEW — how this tab got here
  sessionId,                     // NEW — only present when source === "session"
  lastSyncedAt                   // NEW — only present when source === "session"
}

STORAGE_KEYS.SESSIONS_JOINED   // NEW — [{ sessionId, shopId }], read by the alarm handler
STORAGE_KEYS.SESSIONS_HOSTED   // NEW — [{ sessionId, shopId, writeToken }], DM-only
```

## New module: `session.js`

Thin relay client, kept separate from `state.js` so the relay implementation can be swapped later without touching anything else:

```
Session.hostShop(shop)                          → { sessionId, writeToken }
Session.publishUpdate(sessionId, writeToken, shop)
Session.endSession(sessionId, writeToken)
Session.fetchLatest(sessionId)                  → { shop, updatedAt } | null
```

## `manifest.json` / CSP changes

- `permissions`: add `"alarms"`
- `host_permissions`: add the relay's domain
- `content_security_policy.extension_pages`: widen `connect-src` to the relay's domain (`script-src 'self'` stays as-is — no remote code, just remote data)

## Interplay between file-based and session-based tabs

This is the part that matters most for having both as options:

- A single tab is either `source: "file"` or `source: "session"` — never both — but a DM can freely offer the same shop as a downloadable file *and* a live session; they're independent publish actions on the same underlying Shop object
- **Re-uploading a file onto a session-synced tab** (same shop `id`): still upserts by id (existing D.18 behavior), but if the existing tab is `source: "session"`, show a warning first — *"This tab is live-synced to session ABC123 — uploading a file will disconnect it from live sync."* — so the player isn't silently dropped from sync without knowing
- **Closing** a session-sourced tab does everything close already does (D.19b), plus removes its entry from `SESSIONS_JOINED` so the alarm handler stops polling it
- Title-collision suffixing (D.20), search/filter/sort (D.22), and the hidden-vs-empty distinction (D.19c) are all unaffected — by the time a shop reaches `tabs`, it's the same object regardless of how it got there

## What stays completely untouched

- `schema.js`, `validator.js` — the exact same `parseAndValidateShopFile()` validates a session payload before it's accepted, same as an uploaded file
- `roles.js` — Go Live / Publish Update / End Session are gated behind `Roles.requireDM()`, same pattern as Export
- `currency.js`, `virtual-list.js`, `attribution.js` — no changes

## Security note

Read access to a session is "anyone with the room code" — fine, since shop listings aren't sensitive. Write access needs the `writeToken` check on the relay side, or literally anyone who found/guessed a room code could overwrite a DM's shop. Room codes should be random enough to not be easily guessable (a 6–8 char random slug, not a counter).

## Status

J.35–J.41 are implemented, plus the `alarms` half of J.42. Still on `LocalMockRelayAdapter` (`chrome.storage`-backed, single-browser-profile only) — swapping in a real `HttpRelayAdapter` is the one remaining step, and it's also what finally requires the `host_permissions` / `connect-src` manifest changes.

## Suggested build order

1. Relay contract + a local stub for dev (a one-file mock server is enough to build against before picking real infra)
2. `session.js` relay client
3. DM flow: Go Live / Publish Update / End Session
4. Player flow: Join + manual Refresh Now — **this alone gets most of the value**, entirely from the popup, no `chrome.alarms`/background changes yet
5. Background polling + badge notification
6. `manifest.json`/CSP updates once a relay is actually chosen

## Suggested addendum to your Action List

Continuing your existing lettering (last item was I.34):

**J. Live session sync (pull-based, additive)**
35. ✅ Session schema: `sessionId`, `writeToken`, relay contract (`GET`/`PUT /sessions/{id}`)
36. ✅ `session.js`: relay client (host, publish, end, fetch)
37. ✅ Creation Interface: Go Live / Publish Update / End Session, gated by `Roles.requireDM()`
38. ✅ Regular Interface: Join Live Session, per-tab sync indicator + Refresh Now
39. ✅ `state.js`: `source`/`sessionId`/`lastSyncedAt`/`sessionUpdatedAt` on tab entries; hosted-sessions storage key (no separate `SESSIONS_JOINED` list was needed — the background poller just filters `tabs` by `source === "session"`)
40. ✅ `background.js`: `chrome.alarms` poll loop (1 min, Chrome's floor), badge update on change, cleared by the popup on open
41. ✅ File-upload-onto-synced-tab warning (disconnect-from-sync confirmation)
42. ⏳ `manifest.json`: `alarms` permission ✅ added; relay `host_permissions` / `connect-src` still deferred until `HttpRelayAdapter` is actually pointed at a real relay (still on `LocalMockRelayAdapter` today)
