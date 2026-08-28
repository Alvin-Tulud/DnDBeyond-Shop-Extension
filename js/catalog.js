/**
 * SRD catalog access.
 *
 * Resolved Decision (round 4): no persistent cache of the bundled catalog
 * in chrome.storage.local — it's read directly from the bundled file each
 * popup open, so there's no staleness/update problem to solve.
 *
 * Action items: B.4, B.5, B.6, B.7
 */

const Catalog = (() => {
  let cache = null; // in-memory only for the lifetime of THIS popup open, not persisted

  async function load() {
    if (cache) return cache;
    const url = chrome.runtime.getURL("data/srd-items.json");
    const res = await fetch(url); // local extension file, not a network call
    if (!res.ok) throw new Error("Could not load the bundled SRD catalog.");
    const data = await res.json();
    cache = data.items || [];
    return cache;
  }

  function distinctTypes(items) {
    return [...new Set(items.map((i) => i.type).filter(Boolean))].sort();
  }

  function search(items, { query = "", type = "" } = {}) {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !q || item.name.toLowerCase().includes(q) || (item.description || "").toLowerCase().includes(q);
      const matchesType = !type || item.type === type;
      return matchesQuery && matchesType;
    });
  }

  return { load, distinctTypes, search };
})();

/**
 * Generic debounce helper (B.6 — debounce search input before filtering).
 */
function debounce(fn, delayMs = 200) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delayMs);
  };
}
