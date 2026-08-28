/**
 * Central validator for imported/exported shop and bundle JSON.
 *
 * Used identically by:
 *  - Creation Interface import (C.15)
 *  - Regular Interface upload, single or multi-file (D.16)
 *  - Bundle detection/expansion (D.17)
 *
 * v1 policy is reject-only: if schemaVersion doesn't match SCHEMA_VERSION,
 * reject with a clear, specific error naming the mismatch. No migration.
 *
 * Action item: G.28
 */

const ValidationResult = (ok, data, error) => ({ ok, data, error });

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateCost(cost, path) {
  if (cost === null || cost === undefined) return null;
  if (!isPlainObject(cost)) {
    throw new Error(`${path}.cost must be an object with gp/sp/cp or null`);
  }
  for (const key of ["gp", "sp", "cp"]) {
    if (cost[key] !== undefined && (typeof cost[key] !== "number" || cost[key] < 0)) {
      throw new Error(`${path}.cost.${key} must be a non-negative number`);
    }
  }
  return null;
}

function validateItem(item, index) {
  const path = `items[${index}]`;
  if (!isPlainObject(item)) throw new Error(`${path} must be an object`);
  if (typeof item.id !== "string" || !item.id) throw new Error(`${path}.id is required`);
  if (typeof item.name !== "string" || !item.name.trim()) throw new Error(`${path}.name is required`);
  if (typeof item.rarity !== "string" || !item.rarity) throw new Error(`${path}.rarity is required`);
  if (typeof item.description !== "string") throw new Error(`${path}.description must be a string`);
  if (item.quantity !== null && item.quantity !== undefined && (typeof item.quantity !== "number" || item.quantity < 0)) {
    throw new Error(`${path}.quantity must be a non-negative number or null`);
  }
  if (item.source !== "srd" && item.source !== "custom") {
    throw new Error(`${path}.source must be "srd" or "custom"`);
  }
  if (item.source === "srd" && !item.catalogId) {
    throw new Error(`${path} has source "srd" but is missing catalogId`);
  }
  validateCost(item.cost, path);
  return true;
}

/**
 * Validates a single Shop object (already-parsed JSON). Throws with a
 * specific, user-facing message on the first problem found.
 */
function validateShop(shop) {
  if (!isPlainObject(shop)) throw new Error("File does not contain a shop object.");
  if (typeof shop.id !== "string" || !shop.id) throw new Error('Shop is missing a valid "id".');
  if (typeof shop.schemaVersion !== "number") throw new Error('Shop is missing a numeric "schemaVersion".');
  if (shop.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: this file is schemaVersion ${shop.schemaVersion}, but this version of the extension only supports schemaVersion ${SCHEMA_VERSION}. The file was not loaded.`
    );
  }
  if (typeof shop.title !== "string" || !shop.title.trim()) throw new Error('Shop is missing a valid "title".');
  if (!Array.isArray(shop.items)) throw new Error('Shop "items" must be an array.');
  shop.items.forEach((item, i) => validateItem(item, i));
  if (shop.srdAttribution !== null && shop.srdAttribution !== undefined && typeof shop.srdAttribution !== "string") {
    throw new Error('Shop "srdAttribution" must be a string or null.');
  }
  return true;
}

function isBundle(parsed) {
  return isPlainObject(parsed) && Array.isArray(parsed.shops) && "bundleVersion" in parsed;
}

/**
 * Parses + validates raw JSON text from an uploaded/imported file.
 * Detects single-shop vs bundle format automatically (D.17).
 *
 * Returns ValidationResult with data = { type: "shop", shop } or
 * { type: "bundle", shops: [...] } on success.
 */
function parseAndValidateShopFile(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    return ValidationResult(false, null, "This file isn't valid JSON and could not be read.");
  }

  try {
    if (isBundle(parsed)) {
      if (parsed.bundleVersion !== BUNDLE_VERSION) {
        return ValidationResult(
          false,
          null,
          `Bundle version mismatch: this file is bundleVersion ${parsed.bundleVersion}, but this version of the extension only supports bundleVersion ${BUNDLE_VERSION}.`
        );
      }
      if (parsed.shops.length === 0) {
        return ValidationResult(false, null, "This bundle file contains no shops.");
      }
      parsed.shops.forEach(validateShop);
      return ValidationResult(true, { type: "bundle", shops: parsed.shops }, null);
    } else {
      validateShop(parsed);
      return ValidationResult(true, { type: "shop", shop: parsed }, null);
    }
  } catch (e) {
    return ValidationResult(false, null, e.message || "This file failed validation.");
  }
}

if (typeof module !== "undefined") {
  module.exports = { parseAndValidateShopFile, validateShop, validateItem, isBundle };
}
