/**
 * Currency helper.
 *
 * Resolved Decision (round 4): a shared gp/sp/cp -> copper helper is used
 * ONLY for cost-based sort comparisons. Displayed/stored cost fields are
 * NEVER auto-converted or overwritten anywhere else in the app.
 *
 * Action item: D.22
 */

const COPPER_PER_SILVER = 10;
const COPPER_PER_GOLD = 100; // 1 gp = 100 cp, 1 sp = 10 cp

/**
 * Converts a { gp, sp, cp } cost object into a total copper value for
 * comparison purposes only. Missing/null cost sorts as 0 (treated as
 * "no listed price" rather than free, but a consistent low sort anchor).
 */
function costToCopper(cost) {
  if (!cost) return 0;
  const gp = Number(cost.gp) || 0;
  const sp = Number(cost.sp) || 0;
  const cp = Number(cost.cp) || 0;
  return gp * COPPER_PER_GOLD + sp * COPPER_PER_SILVER + cp;
}

/**
 * Formats a cost object for display, e.g. "3 gp, 5 sp". Never converts
 * denominations against each other — just prints whichever are non-zero.
 * Returns null if there's nothing to show (so callers can render "—").
 */
function formatCost(cost) {
  if (!cost) return null;
  const parts = [];
  if (cost.gp) parts.push(`${cost.gp} gp`);
  if (cost.sp) parts.push(`${cost.sp} sp`);
  if (cost.cp) parts.push(`${cost.cp} cp`);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

if (typeof module !== "undefined") {
  module.exports = { costToCopper, formatCost, COPPER_PER_SILVER, COPPER_PER_GOLD };
}
