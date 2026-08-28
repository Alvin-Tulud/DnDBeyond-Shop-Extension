# Live Share (Pull-Based) — Status

Adds a second, opt-in way to get a shop to players: instead of (or alongside) exporting/importing a JSON file, the DM can host a shop under a short room code, and players either get updates automatically in the background or check on demand. File export/import is completely unchanged — this is purely additive.

## Where these files go

Drop these into your existing `dndbeyond-shop-extension/dndbeyond-shop/` folder, preserving paths:

```
js/session.js        ← NEW
js/state.js            ← replace
js/creation.js          ← replace
js/regular.js            ← replace
js/ui-common.js           ← replace
js/popup.js                ← replace
popup.html                  ← replace
background.js                 ← replace
manifest.json                   ← replace
```

`schema.js`, `validator.js`, `currency.js`, `attribution.js`, `roles.js`, `catalog.js`, `virtual-list.js`, `css/*`, `data/srd-items.json`, `js/jquery.min.js` are untouched.

## What's implemented

- **Go Live / Publish Update / End Session** (Creation Interface, DM only)
- **Join Live Session / Refresh Now** (Regular Interface)
- **Background sync** — `chrome.alarms` wakes the service worker roughly once a minute (Chrome's floor) to check every live-synced tab, even with the popup closed. A changed shop is written straight to storage and the toolbar badge lights up; opening the popup clears it.
- **Upload-onto-synced-tab warning** — uploading a file that matches a shop id you're currently live-synced to asks for confirmation first, since it disconnects that tab from live sync.
- **No hidden shops feature** — closing is now the only way to remove a loaded shop from the tab bar (see the spec doc's round 7 note).

## Still on the mock relay

`js/session.js` ships with a `LocalMockRelayAdapter` that stores sessions in `chrome.storage.local` instead of calling a real server. Everything above — Go Live, Publish Update, End Session, Join, Refresh, and now background polling — works end to end, but **only within a single browser profile** (the DM and the "player" are just the same installed extension toggling role), since `chrome.storage.local` is per-extension-install, not shared across devices.

### Try it locally

1. Load the extension unpacked, open the popup, toggle to **Dungeon Master**
2. Build a shop, click **📡 Go Live** — note the room code shown
3. Toggle back to **User**
4. Paste the room code into **Join** on the Browse Shops screen
5. Go back to DM mode, add/edit an item, click **⬆ Publish Update**
6. Within a minute, the toolbar badge should light up on its own — open the popup and the shop is already updated. (Or just click **🔄 Refresh** next to the shop title to check immediately.)

## What's left

- **Real cross-device relay** — swap `ACTIVE_ADAPTER` in `session.js` for the already-stubbed `HttpRelayAdapter` against a real deployed endpoint. This is the point where `manifest.json` actually needs `host_permissions` and a widened `connect-src` for the relay's domain — the `alarms` permission needed for background polling is already in place.
- No bundle-session support — a session hosts exactly one shop, same as the DM's single Creation Interface draft.
