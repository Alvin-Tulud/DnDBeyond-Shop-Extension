# Shop Keeper — DnD Beyond Shop Chrome Extension (v1)

Unofficial fan tool. Not affiliated with, endorsed, or sponsored by D&D Beyond, Wizards of the Coast, or Hasbro.

## Load it (unpacked)
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**, select this folder
4. Pin the extension and click its icon to open the popup

## What's implemented (maps to the Logic Layer Action List in the spec)

- **A. Data model** — `js/schema.js`: Item/Shop/Bundle schemas, `crypto.randomUUID()` ids, `schemaVersion`.
- **B. Catalog access** — `js/catalog.js` + `data/srd-items.json`: a bundled, build-time SRD snapshot (no live `dndbeyond.com` calls, no host permission). Loaded fresh from the local file each popup open — no `chrome.storage.local` cache to go stale. Search input is debounced.
- **C. Creation Interface** — `js/creation.js`: title binding, SRD catalog picker with search/type filter, custom item form, add/edit/remove (with confirm), export (auto-stamps SRD attribution), import-to-edit.
- **D. Regular Interface** — `js/regular.js`: multi-file upload, single-shop vs. bundle detection, tab manager keyed by shop id (re-upload updates in place), hide vs. close semantics, the "hidden vs. truly empty" empty-state distinction, title-collision suffixing by load order, player-side search/filter/sort (cost sort via the shared gp/sp/cp→copper helper, display values never mutated).
- **E. Roles** — `js/roles.js`: DM/User is a local toggle (no backend/auth exists in this design). DM-only actions are gated in the *logic* (`Roles.requireDM(...)`), not just hidden in the UI — even a direct call from the console gets refused with a toast.
- **F. State/persistence** — `js/state.js`: single store, persisted to `chrome.storage.local`.
- **G. Validation** — `js/validator.js` (shared by import/export/upload, reject-only on schema mismatch) and `js/attribution.js` (CC-BY-4.0 SRD attribution stamped automatically on export).
- **H. Extension architecture** — `manifest.json`: MV3, `storage`-only permission, popup + minimal background worker, no content script.
- **I. UI wiring** — `js/ui-common.js` + `js/virtual-list.js`: toasts, modals, confirm dialog, loading states, and a scroll-based virtualizer that only activates past ~40 items.

CSS is Tailwind, but **pre-compiled to a static file** (`css/tailwind-output.css`) rather than pulled from a CDN at runtime — MV3's default extension-page CSP blocks remote script/style loading, so this keeps the extension store-review-friendly. `css/app.css` holds the handful of things Tailwind utilities don't cleanly express (modal overlay, virtualization positioning, toast animation).

## Known simplifications in this pass
- `data/srd-items.json` is a representative ~50-item snapshot I hand-assembled (equipment, armor, weapons, and a few common magic items) rather than a full `dnd5eapi.co` pull, since this sandbox can't reach that host. Swap it out with a real build-time pull before shipping — the loader/schema (`catalogId`, `type`, `rarity`, `cost`, `description`) already matches what a real pull would need.
- Bundle *export* (DM packaging several shops into one file) isn't wired to a button yet — the bundle *schema* and *import* path (single-file multi-shop upload) are fully implemented and tested, per the spec's "optional" note on export.
- Icons are placeholder art generated locally, not final branding.

## Smoke-tested
Schema/validator/currency/attribution logic was exercised directly (round-trip export→import, schema-version mismatch rejection, malformed JSON rejection, SRD-item-missing-catalogId rejection, bundle-of-N parsing) — see the project notes if you want to rerun that harness.
