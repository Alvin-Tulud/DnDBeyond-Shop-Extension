/**
 * Central state store + chrome.storage.local persistence.
 *
 * Holds: current shop draft (Creation Interface), loaded shop tabs
 * (Regular Interface, keyed by shop id) plus source/sessionId/
 * lastSyncedAt/sessionUpdatedAt for Live Share (see J.39), current user
 * role, and hosted-session bookkeeping for the DM side
 * of Live Share (one writeToken per shop the DM has gone live with). The
 * SRD catalog itself is intentionally NOT part of this persisted state
 * (see catalog.js / B.5).
 *
 * There is no "hidden" concept on tabs — closing (D.19b) is the only way
 * to remove a loaded shop from view; see Resolved Decisions round 7.
 *
 * Action items: F.26, F.27, J.39
 */

const STORAGE_KEYS = {
  ROLE: "shopkeeper_role", // "dm" | "user"
  DRAFT: "shopkeeper_creation_draft", // in-progress Shop object
  TABS: "shopkeeper_loaded_shops", // { [shopId]: { shop, loadOrder, source, sessionId?, lastSyncedAt?, sessionUpdatedAt? } }
  HOSTED_SESSIONS: "shopkeeper_hosted_sessions" // { [shopId]: { sessionId, writeToken, updatedAt } } — DM-only
};

const State = (() => {
  let role = "user";
  let draft = null; // current Creation Interface shop draft
  let tabs = {}; // shopId -> { shop, loadOrder, source, sessionId?, lastSyncedAt?, sessionUpdatedAt? }
  let hostedSessions = {}; // shopId -> { sessionId, writeToken, updatedAt } (DM side of Live Share)
  let activeShopId = null; // currently viewed tab in Regular Interface
  let nextLoadOrder = 1;

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  async function hydrate() {
    const stored = await storageGet([
      STORAGE_KEYS.ROLE, STORAGE_KEYS.DRAFT,
      STORAGE_KEYS.TABS, STORAGE_KEYS.HOSTED_SESSIONS
    ]);
    role = stored[STORAGE_KEYS.ROLE] || "user";
    draft = stored[STORAGE_KEYS.DRAFT] || createShop();
    tabs = stored[STORAGE_KEYS.TABS] || {};
    hostedSessions = stored[STORAGE_KEYS.HOSTED_SESSIONS] || {};
    nextLoadOrder = Object.values(tabs).reduce((max, t) => Math.max(max, (t.loadOrder || 0) + 1), 1);
    // Pick an initial active tab: first tab by load order
    const sorted = Object.values(tabs).sort((a, b) => a.loadOrder - b.loadOrder);
    activeShopId = sorted[0]?.shop.id || null;
  }

  // ---- Role ----
  function getRole() { return role; }
  async function setRole(newRole) {
    role = newRole;
    await storageSet({ [STORAGE_KEYS.ROLE]: role });
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
  function getSortedTabs() {
    return Object.values(tabs).sort((a, b) => a.loadOrder - b.loadOrder);
  }
  function getActiveShopId() { return activeShopId; }
  function setActiveShopId(id) { activeShopId = id; }

  async function persistTabs() {
    await storageSet({ [STORAGE_KEYS.TABS]: tabs });
  }

  /**
   * Adds or updates a loaded shop tab. Re-uploading/re-syncing a shop with
   * the same id updates its existing tab rather than duplicating it (D.18).
   *
   * `meta` optionally carries Live Share info: { source: "file"|"session",
   * sessionId, lastSyncedAt, sessionUpdatedAt }. Any field left out of
   * `meta` falls back to whatever the existing tab already had, and a
   * brand-new tab with no meta at all defaults to source: "file" (J.39) —
   * so every existing call site (plain file upload) keeps working exactly
   * as before without being touched.
   */
  async function upsertShopTab(shop, meta = {}) {
    const existing = tabs[shop.id];
    tabs[shop.id] = {
      shop,
      loadOrder: existing ? existing.loadOrder : nextLoadOrder++,
      source: meta.source || existing?.source || "file",
      sessionId: meta.sessionId !== undefined ? meta.sessionId : existing?.sessionId,
      lastSyncedAt: meta.lastSyncedAt !== undefined ? meta.lastSyncedAt : existing?.lastSyncedAt,
      sessionUpdatedAt: meta.sessionUpdatedAt !== undefined ? meta.sessionUpdatedAt : existing?.sessionUpdatedAt
    };
    await persistTabs();
    return tabs[shop.id];
  }

  /**
   * Fully removes a shop from the loaded tab set (D.19b — close). Not
   * reversible without re-importing/re-joining; re-importing afterward
   * creates a fresh tab as if imported for the first time (no "closed"
   * memory kept). For a session-sourced tab, this doubles as how a player
   * leaves a live session — there's no separate "leave" action in v1, and
   * (as of round 7) no "hide" action either — closing is the only way to
   * remove a tab from view.
   */
  async function closeShopTab(shopId) {
    delete tabs[shopId];
    await persistTabs();
    if (activeShopId === shopId) activeShopId = null;
  }

  // ---- Hosted sessions (Creation Interface / DM side of Live Share, J.37) ----
  function getHostedSession(shopId) {
    return hostedSessions[shopId] || null;
  }
  async function setHostedSession(shopId, info) {
    hostedSessions[shopId] = info;
    await storageSet({ [STORAGE_KEYS.HOSTED_SESSIONS]: hostedSessions });
  }
  async function clearHostedSession(shopId) {
    delete hostedSessions[shopId];
    await storageSet({ [STORAGE_KEYS.HOSTED_SESSIONS]: hostedSessions });
  }

  return {
    hydrate,
    getRole, setRole,
    getDraft, setDraft, resetDraft,
    getTabs, getSortedTabs,
    getActiveShopId, setActiveShopId,
    upsertShopTab, closeShopTab,
    getHostedSession, setHostedSession, clearHostedSession
  };
})();
