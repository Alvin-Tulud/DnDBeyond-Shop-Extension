#!/usr/bin/env node
/**
 * Build-time SRD catalog puller.
 *
 * Pulls the full SRD 5.1 equipment + magic-items list from dnd5eapi.co and
 * maps it into this extension's catalog item shape:
 *
 *   { catalogId, name, type, rarity, description, cost: {gp,sp,cp}|null, weight }
 *
 * This is NOT called at runtime by the extension (see Catalog Data Access
 * in the spec — dnd5eapi.co has no auth/key but is unsupported/undocumented
 * and can rate-limit; the extension only ever reads the local bundled file).
 * Run this manually whenever you want to refresh data/srd-items.json, then
 * commit the result.
 *
 * Usage:
 *   node scripts/fetch-srd.js
 *
 * Requires Node 18+ (built-in fetch). No npm dependencies.
 */

const fs = require("fs");
const path = require("path");

const ROOT = "https://www.dnd5eapi.co"; // list/detail `url` fields returned by the API already include the /api/2014 prefix
const BASE = `${ROOT}/api/2014`; // used only for the two top-level list requests
const OUT_PATH = path.join(__dirname, "..", "data", "srd-items.json");
const CONCURRENCY = 5; // be polite — this is an unsupported, third-party endpoint
const DELAY_MS = 120; // small delay between batches

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
 * gp/sp/cp, so ep and pp get folded into the nearest of those (ep -> half
 * a gp's worth in sp+cp is overkill for a shop list; we just convert to
 * whichever of gp/sp/cp is closest and note the rest as 0). Simpler: convert
 * everything to a copper total, then re-express in gp/sp/cp (matches the
 * same normalization already used for cost-sort comparisons in currency.js).
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
  // listEntry.url is already a full path like "/api/2014/equipment/abacus" — don't prefix with BASE again
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
  // listEntry.url is already a full path like "/api/2014/magic-items/wand-of-magic-missiles" — don't prefix with BASE again
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

async function main() {
  console.log("Fetching SRD equipment + magic-items lists...");
  const [equipmentList, magicItemsList] = await Promise.all([
    fetchJson(`${BASE}/equipment`),
    fetchJson(`${BASE}/magic-items`)
  ]);

  console.log(`Found ${equipmentList.count} equipment entries, ${magicItemsList.count} magic items. Fetching details...`);

  const { results: equipment, skipped: equipSkipped } = await mapLimited(equipmentList.results, mapEquipmentItem);
  const { results: magicItems, skipped: magicSkipped } = await mapLimited(magicItemsList.results, mapMagicItem);

  const items = [...equipment, ...magicItems].sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    srdVersion: "5.1",
    pulledAt: new Date().toISOString().slice(0, 10),
    sourceNote: "Pulled from dnd5eapi.co (open D&D 5e SRD dataset) at build time via scripts/fetch-srd.js. Not a runtime call.",
    items
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${items.length} items to ${OUT_PATH}`);

  const skipped = [...equipSkipped, ...magicSkipped];
  if (skipped.length > 0) {
    console.warn(`\n${skipped.length} entries were skipped due to fetch/parse errors:`);
    skipped.forEach((s) => console.warn(`  - ${s.index}: ${s.error}`));
  }
}

main().catch((e) => {
  console.error("Fatal error pulling SRD data:", e);
  process.exit(1);
});
