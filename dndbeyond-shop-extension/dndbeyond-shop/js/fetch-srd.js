#!/usr/bin/env node
/**
 * Build-time SRD catalog puller.
 *
 * Pulls the full SRD equipment + magic-items list from dnd5eapi.co and maps
 * it into this extension's catalog item shape:
 *
 *   { catalogId, name, type, rarity, description, cost: {gp,sp,cp}|null, weight }
 *
 * Supports both SRD editions dnd5eapi.co serves:
 *   --edition=2014  ->  SRD 5.1 (original CC-BY-4.0 SRD)      [default]
 *   --edition=2024  ->  SRD 5.2 (2024 rules revision, also CC-BY-4.0)
 *
 * A note on the 2024/5.2 endpoint: as of this writing, dnd5eapi.co's
 * /api/2024 routes are newer than /api/2014 and have at times been reported
 * as incomplete for some categories (e.g. far fewer entries than the real
 * SRD 5.2 contains). This script can't detect *wrong* data, but it does
 * sanity-check *count* — if equipment or magic-items come back suspiciously
 * thin, it prints a loud warning instead of silently writing a stub catalog.
 * If you hit that warning, verify by hand (e.g. open
 * https://www.dnd5eapi.co/api/2024/equipment in a browser and eyeball
 * `count`) before trusting the output, or use an alternate source.
 *
 * This is NOT called at runtime by the extension (see Catalog Data Access
 * in the spec — dnd5eapi.co has no auth/key but is unsupported/undocumented
 * and can rate-limit; the extension only ever reads the local bundled file).
 * Run this manually whenever you want to refresh data/srd-items.json, then
 * commit the result.
 *
 * Usage:
 *   node scripts/fetch-srd.js                    # SRD 5.1 (2014), default — full overwrite
 *   node scripts/fetch-srd.js --edition=2024      # SRD 5.2 (2024) — full overwrite
 *   node scripts/fetch-srd.js --merge             # merge into existing data/srd-items.json
 *   node scripts/fetch-srd.js --edition=2024 --out=data/srd-items-5.2.json
 *
 * By default this script REPLACES the output file entirely — it does not
 * read or preserve anything already there. Pass --merge to change that:
 * the existing file (if any) is read first, then merged with this run's
 * fresh pull. On any catalogId present in both, the NEW pull always wins
 * (fresher name/description/cost/etc. replace the old values). Any
 * catalogId that exists in the old file but wasn't part of this run (e.g.
 * it failed to fetch this time, or belongs to a category this run didn't
 * touch) is carried over unchanged rather than being dropped. Entries with
 * no catalogId at all (e.g. hand-added custom entries) are always kept
 * as-is, since there's nothing to match them against.
 *
 * Requires Node 18+ (built-in fetch). No npm dependencies.
 */

const fs = require("fs");
const path = require("path");

const EDITIONS = {
  "2014": { srdVersion: "5.1", apiPath: "/api/2014", label: "SRD 5.1 (2014 rules)" },
  "2024": { srdVersion: "5.2", apiPath: "/api/2024", label: "SRD 5.2 (2024 rules)" }
};

// Below this count, warn that the pull looks like a stub rather than a full
// catalog. These are conservative floors (the real SRD has far more of
// each), just enough to catch an obviously-broken/empty endpoint.
const MIN_EXPECTED_EQUIPMENT = 30;
const MIN_EXPECTED_MAGIC_ITEMS = 30;

const ROOT = "https://www.dnd5eapi.co"; // list/detail `url` fields returned by the API already include the edition prefix
const CONCURRENCY = 5; // be polite — this is an unsupported, third-party endpoint
const DELAY_MS = 120; // small delay between requests

function parseArgs(argv) {
  const args = { edition: "2014", out: null, merge: false, mergeFrom: null };
  for (const raw of argv) {
    if (raw === "--merge") { args.merge = true; continue; }
    const [key, value] = raw.replace(/^--/, "").split("=");
    if (key === "edition") args.edition = value;
    if (key === "out") args.out = value;
    if (key === "merge-from") { args.merge = true; args.mergeFrom = value; }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Runs async `worker` over `items` with limited concurrency, collecting results and skipping failures. */
async function mapLimited(items, worker) {
  const results = [];
  const skipped = [];
  let i = 0;
  async function runBatch() {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      try {
        const mapped = await worker(item);
        if (mapped) results.push(mapped);
      } catch (e) {
        skipped.push({ index: item.index, error: e.message });
      }
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, runBatch));
  return { results, skipped };
}

/**
 * The API mixes cost units (cp, sp, ep, gp, pp). Our schema only stores
 * gp/sp/cp, so everything is converted to a copper total, then re-expressed
 * in gp/sp/cp (matches the same normalization already used for cost-sort
 * comparisons in currency.js).
 */
function normalizeCost(apiCost) {
  if (!apiCost || typeof apiCost.quantity !== "number") return null;
  const perUnitInCopper = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
  const unit = (apiCost.unit || "gp").toLowerCase();
  const totalCopper = apiCost.quantity * (perUnitInCopper[unit] ?? 100);
  const gp = Math.floor(totalCopper / 100);
  const remAfterGp = totalCopper % 100;
  const sp = Math.floor(remAfterGp / 10);
  const cp = remAfterGp % 10;
  if (gp === 0 && sp === 0 && cp === 0) return null;
  return { gp, sp, cp };
}

function joinDesc(desc) {
  if (!desc) return "";
  if (Array.isArray(desc)) return desc.join(" ").trim();
  return String(desc).trim();
}

async function mapEquipmentItem(listEntry) {
  // listEntry.url is already a full path like "/api/2014/equipment/abacus" — don't re-prefix it
  const detail = await fetchJson(`${ROOT}${listEntry.url}`);
  const type =
    detail.gear_category?.name ||
    detail.weapon_category && `${detail.weapon_category} ${detail.weapon_range || ""} Weapon`.trim() ||
    detail.armor_category && `${detail.armor_category} Armor` ||
    detail.equipment_category?.name ||
    "Adventuring Gear";

  let description = joinDesc(detail.desc);
  // Weapons/armor often carry mechanically-relevant info outside `desc`
  if (detail.damage) {
    const dmg = `${detail.damage.damage_dice || ""} ${detail.damage.damage_type?.name || ""}`.trim();
    description = [description, dmg && `Damage: ${dmg}.`].filter(Boolean).join(" ");
  }
  if (detail.armor_class) {
    const ac = `AC ${detail.armor_class.base}${detail.armor_class.dex_bonus ? " + Dex" : ""}${
      detail.armor_class.max_bonus ? ` (max ${detail.armor_class.max_bonus})` : ""
    }`;
    description = [description, ac + "."].filter(Boolean).join(" ");
  }
  if (detail.range) {
    description = [description, `Range ${detail.range.normal}${detail.range.long ? "/" + detail.range.long : ""} ft.`]
      .filter(Boolean).join(" ");
  }
  // 2024/SRD 5.2 weapons introduced "mastery" properties — fold in if present, harmless no-op for 2014 data
  if (detail.weapon_mastery?.name || detail.mastery?.name) {
    const mastery = detail.weapon_mastery?.name || detail.mastery?.name;
    description = [description, `Mastery: ${mastery}.`].filter(Boolean).join(" ");
  }
  if (!description) description = detail.name;

  return {
    catalogId: `srd-${detail.index}`,
    name: detail.name,
    type,
    rarity: "Common", // mundane equipment has no rarity concept in the API; SRD gear defaults to Common
    description,
    cost: normalizeCost(detail.cost),
    weight: typeof detail.weight === "number" ? detail.weight : null
  };
}

async function mapMagicItem(listEntry) {
  // listEntry.url is already a full path like "/api/2014/magic-items/wand-of-magic-missiles" — don't re-prefix it
  const detail = await fetchJson(`${ROOT}${listEntry.url}`);
  let description = joinDesc(detail.desc);
  if (!description) description = detail.name;

  // Rarity strings from the API ("Varies", "Legendary (Requires Attunement)", etc.)
  // are passed through as-is — validator.js only requires a non-empty string,
  // it doesn't restrict to the RARITIES list used by the custom-item dropdown.
  const rarity = detail.rarity?.name || "Rare";

  return {
    catalogId: `srd-${detail.index}`,
    name: detail.name,
    type: detail.equipment_category?.name || "Wondrous Item",
    rarity,
    description,
    cost: null, // magic items generally have no standard SRD price — DM sets this per-shop after adding
    weight: null
  };
}

/**
 * Loads an existing catalog file for merging. Returns null (not an error)
 * if the file doesn't exist yet — that's just "nothing to merge, first run".
 * Throws if the file exists but isn't readable/parseable JSON, since silently
 * discarding a malformed existing file could look like data loss.
 */
function loadExistingCatalog(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--merge target ${filePath} exists but isn't valid JSON (${e.message}). Fix or remove it, or omit --merge to overwrite.`);
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error(`--merge target ${filePath} doesn't look like a catalog file (missing "items" array).`);
  }
  return parsed;
}

/**
 * Merges a fresh pull (`newItems`) into an existing catalog's items
 * (`oldItems`), keyed by catalogId. New data always wins on overlap;
 * old entries not touched by this pull are preserved; entries without a
 * catalogId (nothing to key on) are always kept from wherever they came
 * from. Returns the merged item list plus stats for the summary log.
 */
function mergeCatalogs(oldItems, newItems) {
  const oldById = new Map();
  const oldUnkeyed = [];
  for (const item of oldItems) {
    if (item.catalogId) oldById.set(item.catalogId, item);
    else oldUnkeyed.push(item);
  }

  const newById = new Map();
  const newUnkeyed = [];
  for (const item of newItems) {
    if (item.catalogId) newById.set(item.catalogId, item);
    else newUnkeyed.push(item);
  }

  let replaced = 0;
  let added = 0;
  for (const catalogId of newById.keys()) {
    if (oldById.has(catalogId)) replaced++;
    else added++;
  }
  const preserved = [...oldById.keys()].filter((id) => !newById.has(id)).length;

  // New data wins on any key present in both maps (Map spread order: later entries overwrite earlier ones)
  const mergedById = new Map([...oldById, ...newById]);
  const merged = [...mergedById.values(), ...oldUnkeyed, ...newUnkeyed]
    .sort((a, b) => a.name.localeCompare(b.name));

  return { merged, stats: { replaced, added, preserved, unkeyedCarried: oldUnkeyed.length + newUnkeyed.length } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const edition = EDITIONS[args.edition];
  if (!edition) {
    console.error(`Unknown --edition="${args.edition}". Valid values: ${Object.keys(EDITIONS).join(", ")}`);
    process.exit(1);
  }
  const outPath = args.out
    ? path.resolve(process.cwd(), args.out)
    : path.join(__dirname, "..", "data", "srd-items.json");
  const base = `${ROOT}${edition.apiPath}`;

  console.log(`Fetching ${edition.label} equipment + magic-items lists from ${base} ...`);
  const [equipmentList, magicItemsList] = await Promise.all([
    fetchJson(`${base}/equipment`),
    fetchJson(`${base}/magic-items`)
  ]);

  console.log(`Found ${equipmentList.count} equipment entries, ${magicItemsList.count} magic items. Fetching details...`);

  // Completeness sanity check — catches an obviously stubbed-out endpoint
  // before we waste time (and rate-limit budget) fetching detail for it.
  const warnings = [];
  if (equipmentList.count < MIN_EXPECTED_EQUIPMENT) {
    warnings.push(
      `Equipment list only has ${equipmentList.count} entries (expected at least ${MIN_EXPECTED_EQUIPMENT}). ` +
      `The ${edition.apiPath} endpoint may be incomplete/stubbed on dnd5eapi.co for this category.`
    );
  }
  if (magicItemsList.count < MIN_EXPECTED_MAGIC_ITEMS) {
    warnings.push(
      `Magic items list only has ${magicItemsList.count} entries (expected at least ${MIN_EXPECTED_MAGIC_ITEMS}). ` +
      `The ${edition.apiPath} endpoint may be incomplete/stubbed on dnd5eapi.co for this category.`
    );
  }
  if (warnings.length > 0) {
    console.warn(`\n⚠️  Possible incomplete source data for ${edition.label}:`);
    warnings.forEach((w) => console.warn(`   - ${w}`));
    console.warn(`   Proceeding anyway — review the output carefully before committing it.\n`);
  }

  const { results: equipment, skipped: equipSkipped } = await mapLimited(equipmentList.results, mapEquipmentItem);
  const { results: magicItems, skipped: magicSkipped } = await mapLimited(magicItemsList.results, mapMagicItem);

  const items = [...equipment, ...magicItems].sort((a, b) => a.name.localeCompare(b.name));

  let finalItems = items;
  let mergeStats = null;
  let existingMeta = null;

  if (args.merge) {
    const mergeFromPath = args.mergeFrom
      ? path.resolve(process.cwd(), args.mergeFrom)
      : outPath;
    const existing = loadExistingCatalog(mergeFromPath);
    if (!existing) {
      console.log(`\n--merge was passed but no existing file was found at ${mergeFromPath} — nothing to merge, writing this pull as-is.`);
    } else {
      existingMeta = { srdVersion: existing.srdVersion, pulledAt: existing.pulledAt, count: existing.items.length };
      if (existing.srdVersion && existing.srdVersion !== edition.srdVersion) {
        console.warn(
          `\n⚠️  Merging across editions: existing file is srdVersion ${existing.srdVersion}, this pull is ${edition.srdVersion}. ` +
          `The merged file will be a mix of both — that's fine if intentional, but double-check before shipping if it's not.`
        );
      }
      const { merged, stats } = mergeCatalogs(existing.items, items);
      finalItems = merged;
      mergeStats = stats;
    }
  }

  const out = {
    srdVersion: edition.srdVersion,
    pulledAt: new Date().toISOString().slice(0, 10),
    sourceNote: mergeStats
      ? `Pulled from dnd5eapi.co (${edition.apiPath}, ${edition.label}) via scripts/fetch-srd.js --merge, on top of an existing file ` +
        `(previously ${existingMeta.count} items, srdVersion ${existingMeta.srdVersion || "unknown"}, pulled ${existingMeta.pulledAt || "unknown date"}). ` +
        `Entries from this pull replaced any matching catalogId; entries only in the old file were preserved as-is. Not a runtime call.`
      : `Pulled from dnd5eapi.co (${edition.apiPath}, ${edition.label}) at build time via scripts/fetch-srd.js. Not a runtime call.`,
    items: finalItems
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

  if (mergeStats) {
    console.log(
      `\nMerge summary: ${mergeStats.replaced} replaced (updated by this pull), ${mergeStats.added} added (new), ` +
      `${mergeStats.preserved} preserved (in the old file, not touched by this pull)` +
      (mergeStats.unkeyedCarried ? `, ${mergeStats.unkeyedCarried} carried as-is (no catalogId to match on)` : "") + "."
    );
  }
  console.log(`Wrote ${finalItems.length} total items (${edition.label}${mergeStats ? ", merged" : ""}) to ${outPath}`);

  const skipped = [...equipSkipped, ...magicSkipped];
  if (skipped.length > 0) {
    console.warn(`\n${skipped.length} entries were skipped due to fetch/parse errors:`);
    skipped.forEach((s) => console.warn(`  - ${s.index}: ${s.error}`));
  }

  if (warnings.length > 0) {
    console.warn(`\nReminder: this pull triggered the completeness warning above — double-check item counts before shipping this catalog.`);
  }
}

main().catch((e) => {
  console.error("Fatal error pulling SRD data:", e);
  process.exit(1);
});
