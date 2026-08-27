/**
 * Live Session relay client (pull-based Live Share).
 *
 * This module is deliberately a thin, swappable client: everything above it
 * (creation.js / regular.js / state.js) talks only in terms of
 * Session.hostShop / publishUpdate / endSession / fetchLatest, never in
 * terms of a specific backend. Swapping the relay later means changing
 * ACTIVE_ADAPTER below and nothing else in the app.
 *
 * Phase 1 (this file): LocalMockRelayAdapter, backed by chrome.storage.local.
 * Lets the whole publish -> join -> refresh loop be exercised end-to-end on
 * a single browser profile (DM and player are just the same extension
 * toggling role) with zero manifest/CSP changes. It does NOT sync across
 * separate browsers/devices.
 *
 * Phase 3 (later): swap ACTIVE_ADAPTER for HttpRelayAdapter once a real
 * relay exists — see the manifest.json note in that adapter's comment.
 *
 * Action items: J.35, J.36
 */

const Session = (() => {
  // ---- Relay contract every adapter must implement ----
  //   get(sessionId)                          -> { shop, updatedAt } | null
  //   put(sessionId, writeToken, shop, updatedAt) -> void, throws on auth/network failure
  //   remove(sessionId, writeToken)            -> void
  // get() intentionally never returns writeToken — that's the "read access
  // is public, write access needs the token" security model from the
  // design doc, enforced here even in the mock.

  const LocalMockRelayAdapter = (() => {
    const key = (sessionId) => `relay_mock_session_${sessionId}`;
    function storageGet(k) {
      return new Promise((resolve) => chrome.storage.local.get([k], (r) => resolve(r[k])));
    }
    function storageSet(obj) {
      return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
    }
    function storageRemove(k) {
      return new Promise((resolve) => chrome.storage.local.remove([k], resolve));
    }
    return {
      async get(sessionId) {
        const record = await storageGet(key(sessionId));
        if (!record) return null;
        return { shop: record.shop, updatedAt: record.updatedAt };
      },
      async put(sessionId, writeToken, shop, updatedAt) {
        const existing = await storageGet(key(sessionId));
        if (existing && existing.writeToken !== writeToken) {
          throw new Error("Not authorized to update this session.");
        }
        await storageSet({ [key(sessionId)]: { shop, updatedAt, writeToken } });
      },
      async remove(sessionId, writeToken) {
        const existing = await storageGet(key(sessionId));
        if (existing && existing.writeToken !== writeToken) {
          throw new Error("Not authorized to end this session.");
        }
        await storageRemove(key(sessionId));
      }
    };
  })();

  /**
   * Real HTTP adapter, for once a relay is deployed. Expects:
   *   GET    {baseUrl}/sessions/{id}                     -> { shop, updatedAt } | 404
   *   PUT    {baseUrl}/sessions/{id}  { writeToken, shop, updatedAt }
   *   DELETE {baseUrl}/sessions/{id}  { writeToken }
   * Requires host_permissions + a widened connect-src for baseUrl's domain
   * in manifest.json before this can be switched on — see the design doc's
   * "manifest.json / CSP changes" section (Phase 3 / action item J.42).
   */
  function HttpRelayAdapter(baseUrl) {
    return {
      async get(sessionId) {
        const res = await fetch(`${baseUrl}/sessions/${sessionId}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Relay error (${res.status}) while fetching session.`);
        return res.json();
      },
      async put(sessionId, writeToken, shop, updatedAt) {
        const res = await fetch(`${baseUrl}/sessions/${sessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ writeToken, shop, updatedAt })
        });
        if (!res.ok) throw new Error(`Relay error (${res.status}) while publishing.`);
      },
      async remove(sessionId, writeToken) {
        const res = await fetch(`${baseUrl}/sessions/${sessionId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ writeToken })
        });
        if (!res.ok && res.status !== 404) throw new Error(`Relay error (${res.status}) while ending session.`);
      }
    };
  }

  // ---- Active adapter — swap this line in Phase 3, nothing else needs to change ----
  // const ACTIVE_ADAPTER = HttpRelayAdapter("https://your-relay.example.com/api");
  const ACTIVE_ADAPTER = LocalMockRelayAdapter;

  // ---- Room code generation ----
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  function generateSessionId(length = 6) {
    let code = "";
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return code;
  }
  function generateWriteToken() {
    return crypto.randomUUID();
  }

  // ---- Public API ----

  /** DM: start hosting a shop. Returns { sessionId, writeToken, updatedAt }. */
  async function hostShop(shop) {
    let sessionId = generateSessionId();
    // Vanishingly unlikely at this code length, but guard against a collision anyway.
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await ACTIVE_ADAPTER.get(sessionId);
      if (!existing) break;
      sessionId = generateSessionId();
    }
    const writeToken = generateWriteToken();
    const updatedAt = new Date().toISOString();
    await ACTIVE_ADAPTER.put(sessionId, writeToken, shop, updatedAt);
    return { sessionId, writeToken, updatedAt };
  }

  /** DM: push the current draft to an existing session. Returns { updatedAt }. */
  async function publishUpdate(sessionId, writeToken, shop) {
    const updatedAt = new Date().toISOString();
    await ACTIVE_ADAPTER.put(sessionId, writeToken, shop, updatedAt);
    return { updatedAt };
  }

  /** DM: stop hosting; the room code stops resolving for anyone still polling it. */
  async function endSession(sessionId, writeToken) {
    await ACTIVE_ADAPTER.remove(sessionId, writeToken);
  }

  /** Player: fetch the current state of a session by room code. Returns null if not found. */
  async function fetchLatest(sessionId) {
    return ACTIVE_ADAPTER.get(sessionId);
  }

  return { hostShop, publishUpdate, endSession, fetchLatest, generateSessionId };
})();

if (typeof module !== "undefined") {
  module.exports = { Session };
}
