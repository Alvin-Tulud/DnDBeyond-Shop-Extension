/**
 * Rarity color helper.
 *
 * Maps an item's rarity string to a display color, used to tint the item
 * name and rarity label in both the Creation Interface and Regular
 * (player) Interface. Purely cosmetic — never touches stored data.
 */

const RARITY_COLORS = {
  "Common": "#000000",
  "Uncommon": "#30c62b",
  "Rare": "#4990e2",
  "Very Rare": "#9810e0",
  "Legendary": "#fea227",
  "Artifact": "#c59682"
};

const DEFAULT_RARITY_COLOR = "#000000";

/**
 * Returns the hex color for a given rarity string. Falls back to the
 * default (common/black) color for unrecognized or missing rarities so
 * custom items with typo'd rarities never end up unstyled.
 */
function rarityColor(rarity) {
  return RARITY_COLORS[rarity] || DEFAULT_RARITY_COLOR;
}

if (typeof module !== "undefined") {
  module.exports = { RARITY_COLORS, DEFAULT_RARITY_COLOR, rarityColor };
}
