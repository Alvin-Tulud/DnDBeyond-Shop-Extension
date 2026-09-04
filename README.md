Link to Chrome Extension Store: https://chromewebstore.google.com/detail/tabletop-shop-keeper-unof/dejilcamagdocimehngogfolgfopipbb?authuser=0&hl=en 

# Shop Keeper — DnD Beyond Shop Chrome Extension

An unofficial, fan-made Chrome extension for tabletop RPG groups. It lets a **Dungeon Master** build shop lists (using a bundled D&D 5e and 5.5e SRD item catalog or fully custom entries) and share them with **players**, who browse them read-only — with no purchasing system. Shops can be shared either as offline JSON files or via live sharing (a lightweight Cloudflare Worker relay), whichever fits your group.

> Not affiliated with, endorsed, or sponsored by D&D Beyond, Wizards of the Coast, or Hasbro.

---

## What it does

Shop Keeper is a browsing tool, not a store. The DM curates a list of items; players view it. There's no gold, no "buy" button, and no stock depletion — it's meant to sit alongside your actual tabletop session as a reference, not to run transactions for you.

### For Dungeon Masters — Creation Interface
- Give a shop a title and build a scrollable list of items.
- **Add items from the bundled SRD catalog** — search and filter by type/rarity, click a result, and it's added with its name, description, rarity, and cost pre-filled.
- **Add fully custom items** via a manual entry form (name, rarity, description, cost, quantity) for anything outside the SRD — rare/named magic items, splatbook content, homebrew, etc.
- Edit any item's cost, quantity, or description after adding it.
- **Share a shop two ways:**
  - **Export as a `.json` file** to share with your group however you already do (Discord, Roll20, Drive, email — whatever works), fully offline.
  - **Live sharing**: publish the shop through a Cloudflare Worker relay so players can pull it into their extension using a room/link code, without you needing to send a file at all.
- Re-import (or re-publish) a previously shared shop to keep editing it — players pull the update the next time they refresh.

### For Players (and DMs, who are also players) — Browse Shops
- **Import shops your way**: load one or more shop JSON files at once, or join a shop via a DM's room/link code for live sharing. Each shop appears as its own tab either way.
- Live-shared shops aren't pushed to players in real time — pull/refresh to fetch the DM's latest version.
- **Multi-shop tabs**: flip between shops the DM has shared, mixing offline-imported and live-shared shops freely. Tabs with the same title are automatically disambiguated (e.g. "Ye Olde Shoppe (2)") based on load order.
- **Close a tab** to remove a shop from your own view for good (this doesn't touch the DM's original file or anyone else's copy — getting it back means re-importing the JSON).
- Search, filter by rarity, and sort by name or cost within the active shop.
- **Items are strictly display-only** — no purchasing, no gold deduction, no "sold out" state, no stock tracking of any kind. Quantity, if set, is just informational.

### Other notable behavior
- **Two coexisting sharing modes, no accounts needed either way**: fully offline JSON import/export, or live sharing through a small Cloudflare Worker relay for pulling shop updates via a room/link code. Nothing about live sharing requires extra setup on the player's end once they're connected. Re-sharing a shop (file or live) with the same shop ID updates the existing tab instead of duplicating it.
- The SRD item catalog is a **local, build-time snapshot** — the extension does not query dndbeyond.com or any other live API at runtime, so it can't be rate-limited or broken by that data source changing.
- Every exported shop that contains an SRD-sourced item automatically carries the required **CC-BY-4.0 attribution statement**, so proper credit travels with the file even if it's shared outside the extension itself.
- A disclaimer footer makes clear this is an unofficial fan tool with no affiliation to D&D Beyond, Wizards of the Coast, or Hasbro.

---

## Installing (unpacked extension)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `dndbeyond-shop-extension/dndbeyond-shop` folder.
5. Pin the extension and click its icon to open the popup.

No build step is required to run it as-is.

---

## For developers / contributors

**Tech stack:** HTML, CSS (Tailwind, pre-compiled — no CDN, MV3-friendly CSP), vanilla JavaScript, jQuery.

**Architecture at a glance:**
- Manifest V3, with `storage` permission plus a host permission for the Cloudflare Worker relay's domain (needed for live sharing/pulling shops).
- The popup *is* the app — both the Creation and Regular interfaces live in `popup.html`; there's no separate extension tab.
- A background service worker seeds default storage on install and handles calls out to the Cloudflare Worker relay for publishing/pulling live-shared shops.
- The Cloudflare Worker acts purely as a relay: it stores/serves the latest published shop JSON for a given room/link code so players can pull it — it isn't a real-time push channel, and offline JSON import/export doesn't touch it at all.
- State (role, theme, shop draft, loaded shop tabs) is persisted to `chrome.storage.local`.

**Key files:**

| File | Responsibility |
|---|---|
| `js/schema.js` | Item / Shop / Bundle data schemas, ID generation |
| `js/validator.js` | Shared import/export/upload JSON validation (reject-only on schema version mismatch) |
| `js/attribution.js` | Auto-stamps CC-BY-4.0 SRD attribution on export when applicable |
| `js/currency.js` | gp/sp/cp → copper helper, used only for cost-based sorting (never mutates stored/displayed cost) |
| `js/catalog.js` | Loads the bundled SRD JSON fresh each popup open; search/filter/debounce |
| `js/state.js` | Central store + `chrome.storage.local` persistence |
| `js/roles.js` | DM/User role handling, enforced at the logic level (not just hidden UI) |
| `js/creation.js` | DM-only Creation Interface logic |
| `js/regular.js` | Player-facing Browse Shops logic (tabs, hide/close, search/sort) |
| `js/ui-common.js` / `js/virtual-list.js` | Toasts, modals, confirm dialogs, scroll virtualization for long lists |
| `data/srd-items.json` | Bundled, build-time SRD catalog snapshot |

Contributions and issues welcome — see the code comments (each function is tagged with its corresponding action-list item) for more context on intended behavior.
