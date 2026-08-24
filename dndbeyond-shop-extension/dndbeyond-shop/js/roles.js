/**
 * Role handling.
 *
 * There's no backend/auth in this extension (Resolved Decisions round 2),
 * so "role" is a local, per-install setting the person toggles themselves —
 * a DM running their own copy of the extension flips themselves into DM
 * mode. This is enforced at the logic level (not just UI hiding): DM-only
 * actions early-return with a permission-denied toast if called while the
 * role is "user", so no code path lets a non-DM reach export/creation logic
 * even if they poke at the DOM.
 *
 * Action items: E.24, E.25
 */

const Roles = (() => {
  function isDM() {
    return State.getRole() === "dm";
  }

  /** Guard for DM-only actions. Returns true if allowed, false (+ toast) if not. */
  function requireDM(actionLabel = "This action") {
    if (isDM()) return true;
    UI.showToast(`${actionLabel} requires Dungeon Master mode.`, "error");
    return false;
  }

  function applyRoleToUI() {
    const dm = isDM();
    $("#roleLabel").text(dm ? "Dungeon Master" : "User");
    $("#roleToggleBtn").attr("title", dm ? "Switch to User mode" : "Switch to Dungeon Master mode");
    $("#creationNavBtn").toggleClass("hidden", !dm);
    // If a non-DM somehow has the creation view active, bounce them to Browse Shops
    if (!dm && $("#view-creation").is(":visible")) {
      $('.nav-tab[data-view="regular"]').trigger("click");
    }
  }

  async function toggleRole() {
    const newRole = isDM() ? "user" : "dm";
    await State.setRole(newRole);
    applyRoleToUI();
    UI.showToast(newRole === "dm" ? "Dungeon Master mode enabled." : "Switched to User mode.", "info");
  }

  return { isDM, requireDM, applyRoleToUI, toggleRole };
})();
