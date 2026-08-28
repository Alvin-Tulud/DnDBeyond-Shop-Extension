# Shop Keeper — DnD Beyond Shop Chrome Extension (v1)

Unofficial fan tool. Not affiliated with, endorsed, or sponsored by D&D Beyond, Wizards of the Coast, or Hasbro.

## Local dev setup (Tailwind + jQuery)

This project vendors both jQuery and a **precompiled** Tailwind stylesheet rather than loading either at runtime — MV3's default extension-page CSP (`script-src 'self'`, set explicitly in `manifest.json`) blocks the Tailwind CDN `<script>` and any other remote script, and it's what Chrome Web Store review expects anyway. So there's a small local build step, but nothing runs at runtime beyond static files.

```bash
npm install
```

That single command (via `postinstall`) does two things:
- copies `node_modules/jquery/dist/jquery.min.js` → `js/jquery.min.js`
- compiles `css/tailwind-input.css` → `css/tailwind-output.css` (minified), scanning `popup.html` and `js/**/*.js` for class usage per `tailwind.config.js`

Available scripts:

| Command | What it does |
|---|---|
| `npm install` | Fresh setup — vendors jQuery + builds CSS once |
| `npm run build` | Re-run both steps manually (e.g. after `git pull` without a fresh install) |
| `npm run build:css` | Just rebuild the CSS after editing `css/tailwind-input.css`, `popup.html`, or adding new Tailwind classes in the JS templates |
| `npm run watch:css` | Rebuild CSS automatically on save while iterating on styles |
| `npm run vendor:jquery` | Just re-copy jQuery (rarely needed on its own) |
| `npm run fetch:srd` | Pull the SRD 5.1 catalog (2014 rules, default) — **overwrites** `data/srd-items.json` entirely |
| `npm run fetch:srd52` | Pull the SRD 5.2 catalog (2024 rules) instead — also a full overwrite |
| `npm run merge:srd` | Same as `fetch:srd`, but **merges** into the existing file instead of overwriting it (new pull wins on overlap, old-only entries preserved) |
| `npm run merge:srd52` | Same, for the 5.2/2024 edition |

`node_modules/`, `package-lock.json`, and the Tailwind build inputs' *output* are gitignored/committed as described in `.gitignore` — only `css/tailwind-output.css` and `js/jquery.min.js` (the compiled/vendored artifacts the extension actually loads) ship in the repo and the packaged zip. If you add a new Tailwind utility class somewhere, run `npm run build:css` before reloading the extension, or the class won't be in the compiled stylesheet yet.

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

CSS is Tailwind, precompiled via the local build pipeline described above (see "Local dev setup"). `css/app.css` holds the handful of things Tailwind utilities don't cleanly express (modal overlay, virtualization positioning, toast animation).

## Known simplifications in this pass
- `data/srd-items.json` is a representative ~50-item snapshot I hand-assembled (equipment, armor, weapons, and a few common magic items) rather than a full `dnd5eapi.co` pull, since this sandbox can't reach that host. Swap it out with a real build-time pull before shipping — `scripts/fetch-srd.js` does this for both SRD editions:
  - `npm run fetch:srd` — SRD 5.1 (`dnd5eapi.co/api/2014`), the original CC-BY-4.0 SRD. **Overwrites** `data/srd-items.json` entirely — no merging, so any hand-edits or previously-successful items not in this run's pull are lost.
  - `npm run fetch:srd52` — SRD 5.2 (`dnd5eapi.co/api/2024`), the 2024 rules revision, also CC-BY-4.0. Same full-overwrite behavior.
  - `npm run merge:srd` / `npm run merge:srd52` — same pulls, but pass `--merge`: the existing `data/srd-items.json` is read first and merged with this run's fresh pull, keyed by `catalogId`. **New data always wins on overlap** (fresher name/description/cost replace the old values); any `catalogId` that's in the old file but wasn't part of this run — e.g. it failed to fetch this time — is **preserved, not dropped**. Entries with no `catalogId` at all (hand-added custom entries) are always carried through untouched. Run prints a summary (`N replaced, N added, N preserved`) so you can see exactly what changed. If the existing file was pulled from a different edition than this run, it'll warn before merging the two — still merges, just flags it so you can decide if that's what you wanted.

  The extension only ever bundles **one** catalog file at a time (`catalog.js` loads a single `data/srd-items.json`), so pick one edition per build rather than trying to ship both. Whichever edition you pull, the output schema (`catalogId`, `type`, `rarity`, `cost`, `description`) is identical — nothing else in the extension needs to change.

  One caveat on the 5.2 pull specifically: `dnd5eapi.co`'s `/api/2024` routes are newer than `/api/2014` and have at times returned notably thinner data for some categories. The script sanity-checks item counts and prints a loud warning if a pull looks suspiciously small rather than silently writing a stub catalog — if you see that warning, spot-check the endpoint by hand (e.g. open `https://www.dnd5eapi.co/api/2024/equipment` and eyeball `count`) before committing the result.
- Bundle *export* (DM packaging several shops into one file) isn't wired to a button yet — the bundle *schema* and *import* path (single-file multi-shop upload) are fully implemented and tested, per the spec's "optional" note on export.
- Icons are placeholder art generated locally, not final branding.

## Smoke-tested
Schema/validator/currency/attribution logic was exercised directly (round-trip export→import, schema-version mismatch rejection, malformed JSON rejection, SRD-item-missing-catalogId rejection, bundle-of-N parsing) — see the project notes if you want to rerun that harness.
