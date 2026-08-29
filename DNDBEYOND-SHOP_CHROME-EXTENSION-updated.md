DnD Beyond Shop Chrome Extension

Tech Stack:  
\- HTML  
\- CSS  
\- Tailwindcss  
\- Javascript  
\- JQuery  
\- AJAX (used for local dataset load / future extensions only — see Catalog Data Access below)

Style Guidelines: 
\- similar style to dndbeyond website  
\- exclaimer at the bottom that this extension has no affiliation with dndbeyond or other parties

2 User types:  
\- Dungeon Master  
  \- Is also a user  
\- User  
  \- Default

Confirmed Scope Decisions:  
\- No purchasing/transactions  
  \- Players view the list only, no buy action, no gold deduction  
\- No stock behavior  
  \- Quantity is a display-only field, never decremented, no sold-out state  
\- No real-time sync  
  \- DM uploads a static JSON snapshot  
  \- Players see it as-is until the DM re-uploads a new one  
  \- No backend, no push updates  
\- Multiple shops supported  
  \- DM can load several shops at once  
  \- Shown to players as separate tabs/views they can flip between

Catalog Data Access (Revised):  
\- DnD Beyond has no official public API, and its internal endpoints are undocumented, unsupported, subject to change without notice, and have a history of rate-limiting/captcha-blocking third-party tools that call them too frequently. Live runtime fetching from dndbeyond.com is out of scope for this build.  
\- Catalog approach: bundle the open D&D 5e SRD dataset (https://www.dnd5eapi.co — no auth, no key, REST/GraphQL) as a static local JSON file shipped inside the extension  
  \- Pulled once at build time (not a runtime call), covers SRD equipment and magic items  
  \- Loaded into chrome.storage.local or imported directly on install/update  
  \- All search/filter runs against this local dataset — no network call in the normal user path  
  \- SRD scope is limited to mundane/common gear and a handful of common magic items; it will not include named/rare/legendary items or splatbook content  
\- Anything outside SRD scope (rare magic items, splatbook content, homebrew) is added via the existing Custom Item manual-entry form, which remains the primary path for non-mundane shop items  
\- No dndbeyond.com host permission required in the manifest as a result — smaller permission footprint, simpler store review  
\- Future/optional: live DnD Beyond fetching could be added later as a v2 stretch goal if the ToS/fragility tradeoff is revisited; schema is designed below to accommodate this without breaking old exported files

Parts of App:  
\- Shop  
  \- Creation Interface  
    \- Shop should have a title  
    \- Scrollable list of items  
    \- Items can be added and removed  
    \- Items can be edited after being added (cost, quantity, description)  
    \- When adding an item it shows all available items from the bundled SRD catalog with a search and filter  
      \- Those values from the SRD catalog can be clicked on and add their values into the listing  
    \- Custom items can also be added manually  
      \- Manual entry form with fields for name, rarity, description, cost, quantity  
      \- Not tied to a catalog entry, so no catalogId populated automatically  
      \- Custom items appear in the scrollable list the same as catalog-sourced items  
    \- Each item listing should have the following:  
      \- Name of item  
      \- Rarity of item  
      \- Description of item  
      \- Cost (optional, gp/sp/cp denominations)  
      \- Quantity (optional, display-only, not tied to stock logic)  
    \- This shop interface should be exportable as a json file and be able to be loaded into regular interface  
    \- Each exported shop should carry a stable id (generated via crypto.randomUUID() at creation time) and schema version so re-uploads and future format changes don't break  
  \- Regular Interface  
    \- Dungeon master can upload a creation interface json and it shows for all players  
    \- DM can upload multiple shop jsons at once  
      \- Each loaded shop appears as its own tab  
      \- Players switch between tabs to browse different shops  
      \- Players can close a loaded shop tab to fully remove it from their own view and storage; closing does not affect the DM's shop or other players' copies, and getting it back requires re-importing the file  
      \- Re-uploading a shop with the same id updates its existing tab rather than duplicating it  
      \- Shops with matching titles are distinguished in the tab bar  
    \- Shop should have a title  
    \- Scrollable list of items  
    \- Search/filter and sort available per shop tab  
    \- Group upload supported  
      \- Multi-file select: file input accepts multiple json files at once, each parsed and validated independently, each added as its own tab  
      \- Bundle export (optional): DM can export several shops as a single json file (an array of shops under a wrapper schema), importable in one action to produce multiple tabs at once  
      \- Import logic detects single-shop vs bundle format and handles both

Roles & Permissions:  
\- DM role determines access to the Creation Interface and export action  
\- Regular users cannot reach Creation Interface controls or the export action, at the logic level, not just hidden in the UI  
\- Import action is not role-gated — any user can import a shop json into their own Regular Interface

Data Integrity:  
\- Imported JSON validated against the shop schema, including version, before loading  
\- Invalid or malformed imports rejected with a clear error rather than a partial load  
\- Schema version handling for v1: reject-only — if an imported file's schemaVersion doesn't match the version this build of the extension supports, reject with a clear error message naming the mismatch. No migration/upgrade path for older versions is built in v1; this can be revisited if the schema changes in a future version

UX Details:  
\- Loading indicators shown during local catalog load (extension install/update) and file import/export actions  
\- Success/error feedback shown for save, export, and upload actions  
\- Empty states shown when no items exist yet or no shop is loaded  
\- No item icons/images; items are text-only (name, rarity, description, cost, quantity)

Performance:  
\- Scrollable item list virtualized if a shop or the SRD catalog grows large

Extension Architecture:  
\- Manifest V3  
\- Permissions scoped to storage only (no dndbeyond.com host permission needed under the SRD-bundle approach)  
\- Popup, background service worker, and any content script roles clearly separated  
\- State (shop drafts, item cache, active tabs, user role) persisted via chrome.storage.local so it survives popup close/reopen

Resolved Decisions (round 2):  
\- Currency uses gp/sp/cp denominations, not a single flat number  
\- No max number of shop tabs a DM can have open at once  
\- Shop JSON distribution is manual, out-of-band file sharing  
  \- DM exports the shop json and shares the file through whatever channel the group already uses (Discord, Roll20, Google Drive, email, etc.)  
  \- No backend, no auth, no new infrastructure required  
  \- Any user can import a shop json file into their own Regular Interface, not just the DM  
  \- Only the DM can create/export a shop from the Creation Interface

Resolved Decisions (round 3 — catalog data source):  
\- No official DnD Beyond API exists; internal endpoints are unsupported, undocumented, and can break or rate-limit without warning — live fetch from dndbeyond.com is out of scope  
\- Catalog is the bundled, open D&D 5e SRD dataset (dnd5eapi.co), pulled once at build time and shipped as a static local JSON file  
\- Item schema field renamed from dndbeyondId to catalogId, with an added source field ("srd" | "custom"), so the schema can accommodate a future live-fetch source without breaking previously exported shop files  
\- Gaps in SRD coverage (rare/named magic items, splatbook content, homebrew) are filled via Custom Item manual entry, not a live fetch

Resolved Decisions (round 4):  
\- SRD catalog freshness: resolved — no persistent cache of the bundled catalog in chrome.storage.local; it's read directly from the bundled file each popup open, so there's no staleness/update problem to solve (see action item B.5)  
\- Shop/item id generation: resolved — crypto.randomUUID() at creation time for both shop ids and item ids, making cross-DM id collisions effectively a non-issue (see A.1, A.2, C.10)  
\- Popup real estate: resolved — the Regular Interface (and Creation Interface) live in the extension popup, not a separate extension tab; popup UI accounts for multi-tab shop browsing + search/filter + virtualization within that constrained space  
\- Title collision handling in tab bar: resolved — append DM/uploader load order (e.g. "Ye Olde Shoppe (2)"), see action item D.20  
\- Currency normalization: resolved — shared gp/sp/cp → copper helper used only for cost-based sort comparisons; displayed/stored cost fields are never auto-converted, see action item D.22  
\- Schema version mismatch: resolved — reject-only for v1, no migration path; see Data Integrity section

Logic Layer Action List:

A. Data model  
1\. Define Item schema: id (crypto.randomUUID()), name, rarity, description, cost (nullable), quantity (nullable), catalogId (nullable, absent for custom items), source ("srd" | "custom") — no image field  
2\. Define Shop schema: id (crypto.randomUUID()), title, items\[\], schemaVersion, createdAt, updatedAt, srdAttribution (string, populated automatically on export whenever the shop contains any SRD-sourced item — see G.28a)  
3\. Decide and document the schema version field so future imports can be validated/migrated

B. Catalog data access (revised — SRD bundle, no live fetch)  
4\. Pull the SRD equipment + magic-items data from dnd5eapi.co once (build-time script, not runtime), and bundle it as a static JSON file inside the extension (e.g. /data/srd-items.json)  
5\. Load the bundled JSON directly at runtime each time the popup opens (no persistent copy written to chrome.storage.local) — since it's a local file, not a network call, there is no meaningful performance cost, and this removes any risk of a stale cached catalog surviving an extension update  
6\. Add debounce to the search input before filtering (now filtering the local dataset, not triggering network requests)  
7\. No retry/timeout/network-error handling needed for the catalog itself, since there is no live fetch in the runtime path and no caching layer to go stale

C. Creation Interface logic  
8\. Bind shop title field to state, persist on change  
9\. Item picker: render search results from the local SRD dataset, wire filter controls (rarity/type), map a clicked SRD result into the internal Item schema (source: "srd") and push into shop.items  
10\. Custom item form: manual entry fields for name, rarity, description, cost, quantity; on submit, generate a local id via crypto.randomUUID() and push into shop.items with source: "custom", no catalogId  
11\. Add-item / remove-item handlers with confirmation on remove  
12\. Edit-item handler for cost/quantity/description after the item is already in the list (works the same for SRD-sourced and custom items)  
13\. Render the scrollable item list from state (virtualize if list is large)  
14\. Export function: serialize Shop object to JSON, auto-populate srdAttribution if any item in the shop has source: "srd" (see G.28a), trigger file download  
15\. Import function: parse JSON, validate against schema (including version check), populate Creation Interface state, with a clear error path for invalid files

D. Regular (player) Interface logic  
16\. Upload handler (any user, not DM-gated): accept single or multiple json file selection, parse and validate each file independently the same way as \#15, then add each parsed shop to the active tab set rather than replacing a single shop  
17\. Bundle format support: detect whether an imported file is a single Shop or a bundle ({ bundleVersion, shops: \[...\] }), and if a bundle, loop through and add each shop as its own tab  
18\. Tab manager: maintain an array/map of loaded shops, each keyed by its stable id (not its title), so re-uploading a shop updates its existing tab instead of duplicating it  
19\. Tab UI logic: render one tab per loaded shop, switch active tab on click, keep only the active shop's item list mounted/rendered  
19b. Close-tab control: each tab has a close (×) action that fully removes that shop from the loaded tab set and its persisted state — not reversible without re-importing the shop's JSON file. Re-importing a shop id after it's been closed creates a fresh tab exactly as if that shop were being imported for the first time (no "this was closed before" memory kept) — closing is not sticky/blocking against future imports. Closing only affects this user's local view (does not affect the DM's original shop or anyone else's imported copy) and is not the same as deleting the shop's underlying data on the DM's end. Prompt for confirmation before closing, since it can't be undone. If the closed tab was the active tab, fall back to another loaded tab, or show the empty state if none remain  
20\. Handle title collisions in the tab bar: append DM/uploader order (e.g. "Ye Olde Shoppe (2)") based on the sequence shops were loaded into the tab set, not a random or id-based suffix  
21\. Render the active shop's title and read-only scrollable item list for players  
22\. Add player-side search/filter and sort, scoped to the active tab's items only. Cost-based sort uses a shared gp/sp/cp → copper normalization helper (1 gp = 100 cp, 1 sp = 10 cp) purely for comparison — the stored/displayed cost fields are never auto-converted or overwritten  
23\. No in-app distribution mechanism to build — export produces a standard JSON file the DM shares out-of-band, and any user imports it via \#16/\#17

E. Roles & permissions  
24\. Implement role detection/assignment (DM vs User)  
25\. Gate Creation Interface and export controls behind DM role at the logic level, not just UI hiding

F. State management & persistence  
26\. Central state object (or lightweight store) for: current shop draft, loaded shop tabs, current user role (SRD item dataset is read fresh from the bundled file each popup open, not held in this persisted state — see B.5)  
27\. Persist state via chrome.storage.local so it survives popup close/reopen

G. Validation & error handling  
28\. Central JSON schema validator used by both export/import and upload paths, covering both single-shop and bundle formats  
28a. Attribution helper: constant string holding the required CC-BY-4.0 SRD attribution statement per Wizards' current terms ("This work includes material from the System Reference Document by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd."); export function checks if shop.items contains any source: "srd" entries and, if so, sets srdAttribution to this constant on the exported Shop object (and on each shop entry within a bundle export). No other Wizards/D&D branding included, per their attribution request
29\. Standardized error/toast messaging for: save success, export success, import failure, permission denied (network failure messaging no longer required for the catalog path, since it's a local dataset)

H. Extension architecture  
30\. Write manifest.json (Manifest V3): storage permission only (no dndbeyond.com host permission needed), background service worker vs popup-only decision  
31\. Content script likely unnecessary under the SRD-bundle approach; revisit only if live DnD Beyond fetch is added in a future version

I. UI event wiring (jQuery/AJAX per stated stack)  
32\. Wire all buttons (add/remove/edit/export/upload/search/tab switch) to their handlers  
33\. Wrap file import/export actions with loading-state indicators  
34\. Debounce all live-filter inputs

Notes for Future Versions (not v1 blockers):  
\- MV3 service worker lifecycle: only relevant if live DnD Beyond fetching is ever added in a future version (v1 has no live fetch and no service-worker-dependent async work, so there's nothing to checkpoint yet) — if that changes, don't rely on in-memory state surviving service worker idle timeout; checkpoint to chrome.storage.local instead

Resolved Decisions (round 5):  
\- Copyright/SRD text usage: resolved — the SRD (5.1 and 5.2) is licensed under Creative Commons Attribution 4.0 International (CC-BY-4.0), which permits using full item names/descriptions/text as-is, provided a short attribution statement travels with the content. Per Wizards' current CC-BY terms, exported shop JSON files (and any bundle exports) will automatically include the required attribution statement — "This work includes material from the System Reference Document by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd." — as a field on the Shop/bundle schema, so it survives peer-to-peer redistribution outside the extension itself, not just in the extension's own listing. Per Wizards' request, no other Wizards/D&D branding or attribution should be added beyond this exact statement. Custom items are unaffected, as this only applies to SRD-sourced content

Resolved Decisions (round 6 — Live Share, pull-based, additive):  
\- A second, opt-in transport for getting a shop to players was added alongside file export/import: the DM can host a shop under a short room code, and players join and sync to it. This does not replace file-based distribution (round 2) — both remain available per shop. Full design in the separate Live Share addendum doc (action items J.35+), not folded into the numbered list above since it's a distinct, additive subsystem.

Resolved Decisions (round 7 — hide feature removed):  
\- Hide/unhide tab functionality (formerly action item D.19a) and the hidden-vs-truly-empty empty-state distinction (formerly D.19c) have been removed. Closing (D.19b) is now the only way to remove a shop from the tab bar; there is no way to temporarily tuck a shop out of view without fully removing it (and, for a live-synced tab, needing to rejoin with the room code to get it back — see the Live Share addendum). Item numbers D.19a and D.19c are intentionally left retired rather than renumbered, so references to D.19b and D.20+ elsewhere (including code comments) stay accurate.
