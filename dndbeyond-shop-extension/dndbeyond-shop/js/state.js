/**
 * Central state store + chrome.storage.local persistence.
 *
 * Holds: current shop draft (Creation Interface), loaded shop tabs
 * (Regular Interface, keyed by shop id, each with a local `hidden` flag),
 * current user role, and UI prefs (theme). The SRD catalog itself is
 * intentionally NOT part of this persisted state (see catalog.js / B.5).
 *
 * Action items: F.26, F.27
 */

const STORAGE_KEYS = {
  ROLE: "shopkeeper_role", // "dm" | "user"
  THEME: "shopkeeper_theme", // "light" | "dark"
  DRAFT: "shopkeeper_creation_draft", // in-progress Shop object
  TABS: "shopkeeper_loaded_shops" // { [shopId]: { shop: Shop, hidden: boolean, loadOrder: number } }
};

const State = (() => {
  let role = "user";
  let theme = "light";
  let draft = null; // current Creation Interface shop draft
  let tabs = {}; // shopId -> { shop, hidden, loadOrder }
  let activeShopId = null; // currently viewed tab in Regular Interface
  let nextLoadOrder = 1;

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  async function hydrate() {
    const stored = await storageGet([STORAGE_KEYS.ROLE, STORAGE_KEYS.THEME, STORAGE_KEYS.DRAFT, STORAGE_KEYS.TABS]);
    role = stored[STORAGE_KEYS.ROLE] || "user";
    theme = stored[STORAGE_KEYS.THEME] || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    draft = stored[STORAGE_KEYS.DRAFT] || createShop();
    tabs = stored[STORAGE_KEYS.TABS] || {};
    nextLoadOrder = Object.values(tabs).reduce((max, t) => Math.max(max, (t.loadOrder || 0) + 1), 1);
    // Pick an initial active tab: first visible (non-hidden) tab by load order
    const visible = Object.values(tabs).filter((t) => !t.hidden).sort((a, b) => a.loadOrder - b.loadOrder);
    activeShopId = visible[0]?.shop.id || null;
  }

  // ---- Role ----
  function getRole() { return role; }
  async function setRole(newRole) {
    role = newRole;
    await storageSet({ [STORAGE_KEYS.ROLE]: role });
  }

  // ---- Theme ----
  function getTheme() { return theme; }
  async function setTheme(newTheme) {
    theme = newTheme;
    await storageSet({ [STORAGE_KEYS.THEME]: theme });
  }

  // ---- Creation draft ----
  function getDraft() { return draft; }
  async function setDraft(newDraft) {
    draft = newDraft;
    await storageSet({ [STORAGE_KEYS.DRAFT]: draft });
  }
  async function resetDraft() {
    draft = createShop();
    await storageSet({ [STORAGE_KEYS.DRAFT]: draft });
    return draft;
  }

  // ---- Loaded shop tabs (Regular Interface) ----
  function getTabs() { return tabs; }
  function getVisibleTabs() {
    return Object.values(tabs).filter((t) => !t.hidden).sort((a, b) => a.loadOrder - b.loadOrder);
  }
  function getHiddenTabs() {
    return Object.values(tabs).filter((t) => t.hidden).sort((a, b) => a.loadOrder - b.loadOrder);
  }
  function getActiveShopId() { return activeShopId; }
  function setActiveShopId(id) { activeShopId = id; }

  async function persistTabs() {
    await storageSet({ [STORAGE_KEYS.TABS]: tabs });
  }

  /**
   * Adds or updates a loaded shop tab. Re-uploading a shop with the same id
   * updates its existing tab rather than duplicating it (D.18).
   */
  async function upsertShopTab(shop) {
    const existing = tabs[shop.id];
    tabs[shop.id] = {
      shop,
      hidden: existing ? existing.hidden : false,
      loadOrder: existing ? existing.loadOrder : nextLoadOrder++
    };
    await persistTabs();
    return tabs[shop.id];
  }

  async function setTabHidden(shopId, hidden) {
    if (!tabs[shopId]) return;
    tabs[shopId].hidden = hidden;
    await persistTabs();
  }

  /**
   * Fully removes a shop from the loaded tab set (D.19b — close). Not
   * reversible without re-importing; re-importing afterward creates a
   * fresh tab as if imported for the first time (no "closed" memory kept).
   */
  async function closeShopTab(shopId) {
    delete tabs[shopId];
    await persistTabs();
    if (activeShopId === shopId) activeShopId = null;
  }

  return {
    hydrate,
    getRole, setRole,
    getTheme, setTheme,
    getDraft, setDraft, resetDraft,
    getTabs, getVisibleTabs, getHiddenTabs,
    getActiveShopId, setActiveShopId,
    upsertShopTab, setTabHidden, closeShopTab
  };
})();
