/**
 * SRD attribution helper.
 *
 * The SRD (5.1/5.2) is licensed under CC-BY-4.0, which permits using full
 * item names/descriptions/text as-is provided a short attribution statement
 * travels with the content. Per Wizards' current CC-BY terms, no other
 * Wizards/D&D branding is added beyond this exact statement.
 *
 * Action item: G.28a
 */

const SRD_ATTRIBUTION_STATEMENT =
  "This work includes material from the System Reference Document by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd.";

/**
 * Given a Shop object, returns the attribution string to stamp onto it on
 * export (or null if the shop has no SRD-sourced items). This is computed
 * fresh at export time — it is not something the DM sets manually.
 */
function computeSrdAttribution(shop) {
  const hasSrdItem = (shop.items || []).some((item) => item.source === "srd");
  return hasSrdItem ? SRD_ATTRIBUTION_STATEMENT : null;
}

if (typeof module !== "undefined") {
  module.exports = { SRD_ATTRIBUTION_STATEMENT, computeSrdAttribution };
}
