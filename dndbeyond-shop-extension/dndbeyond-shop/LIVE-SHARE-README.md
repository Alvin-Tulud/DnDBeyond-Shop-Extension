# Live Share (Pull-Based) — Phase 1

Adds a second, opt-in way to get a shop to players: instead of (or alongside) exporting/importing a JSON file, the DM can host a shop under a short room code and players fetch the latest copy on demand. File export/import is completely unchanged — this is purely additive.

## Where these files go

Drop these into your existing `dndbeyond-shop-extension/dndbeyond-shop/` folder, preserving paths:

```
js/session.js        ← NEW
js/state.js           ← replace
js/creation.js         ← replace
js/regular.js          ← replace
js/ui-common.js         ← replace
js/popup.js              ← replace
popup.html                ← replace
```

Everything else (`schema.js`, `validator.js`, `currency.js`, `attribution.js`, `roles.js`, `catalog.js`, `virtual-list.js`, `background.js`, `manifest.json`, `css/*`, `data/srd-items.json`, `js/jquery.min.js`) is untouched — **no manifest or CSP changes in this phase.**

## How it works right now

`js/session.js` ships with a `LocalMockRelayAdapter` that stores sessions in `chrome.storage.local` instead of calling a real server. This is enough to exercise the entire flow — Go Live, Publish Update, End Session, Join, Refresh — but it only works **within a single browser profile** (the DM and the "player" are just the same installed extension toggling role), since `chrome.storage.local` is per-extension-install, not shared across devices.

### Try it locally

1. Load the extension unpacked, open the popup, toggle to **Dungeon Master**
2. Build a shop, click **📡 Go Live** — note the room code shown
3. Toggle back to **User**
4. Paste the room code into **Join** on the Browse Shops screen
5. Go back to DM mode, add/edit an item, click **⬆ Publish Update**
6. Back in User mode, click the **🔄** button next to the shop title — the update appears

## What's NOT in this phase (see the design doc)

- No `chrome.alarms` background polling yet — updates only show up when the player clicks **🔄 Refresh** or rejoins. That's next.
- No real cross-device relay — swapping in `HttpRelayAdapter` (already stubbed in `session.js`) against a real deployed endpoint is the step after that, and is the point where `manifest.json` (`host_permissions`, `connect-src`) actually needs to change.
- No bundle-session support — a session hosts exactly one shop, same as the DM's single Creation Interface draft.

## New behavior worth knowing about

- **Closing a session tab** doubles as "leaving" the session — there's no separate leave action. Re-joining afterward with the same room code starts fresh, same philosophy as re-importing a closed file-based shop.
- **Re-uploading a file onto a session-synced tab** still works (same shop `id` upserts in place), it just silently converts that tab back to file-sourced — worth a warning prompt in a future pass, intentionally left simple for Phase 1.
- **Ending a live session** doesn't affect players who already joined and haven't refreshed since — they keep their last-synced copy, they just won't get further updates (and Refresh will tell them the session's gone).
- Read access to a session is "anyone with the room code"; write access requires the DM's `writeToken`, which never leaves their own install (`Session`'s adapters never return it from `get()`), so a stranger with just the room code can't overwrite the shop.
