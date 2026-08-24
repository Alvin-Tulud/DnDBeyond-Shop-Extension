/**
 * Background service worker.
 *
 * This build has no live network fetching and no content-script role
 * (H.31 — a content script is unnecessary under the SRD-bundle approach;
 * revisit only if a live DnD Beyond fetch is added in a future version).
 * All real logic lives in the popup, since Regular/Creation Interfaces
 * live in the popup itself (Resolved Decisions round 4).
 *
 * The worker is kept here only to:
 *  - seed sensible chrome.storage.local defaults on first install
 *  - stay MV3-compliant (a service worker file is required by the manifest)
 *
 * Note for future versions: if a live-fetch feature is ever added, don't
 * rely on in-memory state surviving service worker idle timeout — persist
 * checkpoints to chrome.storage.local instead.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.get(["shopkeeper_role"], (stored) => {
      if (!stored.shopkeeper_role) {
        chrome.storage.local.set({ shopkeeper_role: "user" });
      }
    });
  }
});
