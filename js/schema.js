/**
 * Schema definitions for Shop / Item / Bundle JSON files.
 *
 * Action list refs: A.1, A.2, A.3
 *
 * v1 is reject-only on version mismatch (see Data Integrity section of spec) —
 * there is intentionally no migration/upgrade path for older schema versions here.
 */

const SCHEMA_VERSION = 1;
const BUNDLE_VERSION = 1;

const RARITIES = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"];

/**
 * Item schema (A.1):
 * {
 *   id: string (crypto.randomUUID()),
 *   name: string,
 *   rarity: string,
 *   description: string,
 *   cost: { gp: number, sp: number, cp: number } | null,
 *   quantity: number | null,
 *   catalogId: string | null,   // absent/null for custom items
 *   source: "srd" | "custom"
 * }
 * No image field, per spec (text-only items).
 */
function createItem({ name, rarity = "Common", description = "", cost = null, quantity = null, catalogId = null, source = "custom" }) {
  return {
    id: crypto.randomUUID(),
    name,
    rarity,
    description,
    cost,
    quantity,
    catalogId: catalogId || null,
    source
  };
}

/**
 * Shop schema (A.2):
 * {
 *   id: string (crypto.randomUUID()),
 *   schemaVersion: number,
 *   title: string,
 *   items: Item[],
 *   createdAt: ISO string,
 *   updatedAt: ISO string,
 *   srdAttribution: string | null  // auto-populated on export, see G.28a
 * }
 */
function createShop({ title = "Untitled Shop" } = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    title,
    items: [],
    createdAt: now,
    updatedAt: now,
    srdAttribution: null
  };
}

/**
 * Bundle schema (D.17):
 * {
 *   bundleVersion: number,
 *   shops: Shop[]
 * }
 */
function createBundle(shops) {
  return {
    bundleVersion: BUNDLE_VERSION,
    shops
  };
}

// UMD-ish export for popup script tags (no bundler in this extension)
if (typeof module !== "undefined") {
  module.exports = { SCHEMA_VERSION, BUNDLE_VERSION, RARITIES, createItem, createShop, createBundle };
}
