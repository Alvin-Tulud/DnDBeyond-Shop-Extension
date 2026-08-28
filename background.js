/**
 * Background service worker.
 *
 * Seeds sensible chrome.storage.local defaults on first install. As of
 * J.40, it also runs a periodic chrome.alarms poll so live-synced shop
 * tabs stay current even when the popup isn't open: each tick, every tab
 * with source: "session" is checked against the relay, and on a change
 * the new shop is written directly into the same storage key the popup
 * reads (state.js's TABS key), with the toolbar badge set so the player
 * notices next time they glance at the extension icon. The popup clears
 * the badge itself on open (popup.js).
 *
 * No content-script role — a content script is still unnecessary under
 * the SRD-bundle approach (H.31); revisit only if a live DnD Beyond
 * fetch is added in a future version.
 *
 * Uses importScripts to pull in the relay client (session.js), since this
 * is a classic (non-module) MV3 service worker — no bundler needed, same
 * approach used everywhere else in this project.
 *
 * Note for future versions: this worker only does short, self-contained
 * async work per alarm tick, so it doesn't need to checkpoint mid-flight
 * state — if a live DnD Beyond fetch is ever added, don't assume
 * in-memory state survives service worker idle timeout; persist
 * checkpoints to chrome.storage.local instead.
 *
 * Action items: H.30, H.31, J.40
 */

importScripts("js/session.js");

const TABS_STORAGE_KEY = "shopkeeper_loaded_shops"; // must match state.js STORAGE_KEYS.TABS
const SYNC_ALARM_NAME = "shopkeeper_session_sync";
const SYNC_INTERVAL_MINUTES = 1; // Chrome enforces a ~1 minute floor on alarms regardless

function ensureSyncAlarm() {
  chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MINUTES });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.get(["shopkeeper_role"], (stored) => {
      if (!stored.shopkeeper_role) {
        chrome.storage.local.set({ shopkeeper_role: "user" });
      }
    });
  }
  ensureSyncAlarm();
});

chrome.runtime.onStartup.addListener(ensureSyncAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) pollSessionTabs();
});

async function pollSessionTabs() {
  const stored = await new Promise((resolve) => chrome.storage.local.get([TABS_STORAGE_KEY], resolve));
  const tabs = stored[TABS_STORAGE_KEY] || {};
  const sessionEntries = Object.values(tabs).filter((t) => t.source === "session");
  if (sessionEntries.length === 0) return;

  let anyChanged = false;
  for (const entry of sessionEntries) {
    try {
      const result = await Session.fetchLatest(entry.sessionId);
      // Session ended/not found: leave the player's last-synced copy as-is —
      // Refresh Now (regular.js) is what surfaces the "no longer available"
      // message once they actually look at that tab.
      if (!result) continue;
      if (result.updatedAt === entry.sessionUpdatedAt) continue; // no change since last check

      tabs[entry.shop.id] = {
        ...entry,
        shop: result.shop,
        lastSyncedAt: new Date().toISOString(),
        sessionUpdatedAt: result.updatedAt
      };
      anyChanged = true;
    } catch (e) {
      // Relay hiccup for this one session — leave it, try again next tick,
      // don't let it block checking the rest.
    }
  }

  if (anyChanged) {
    await new Promise((resolve) => chrome.storage.local.set({ [TABS_STORAGE_KEY]: tabs }, resolve));
    chrome.action.setBadgeText({ text: "●" });
    chrome.action.setBadgeBackgroundColor({ color: "#8B0000" });
  }
}
