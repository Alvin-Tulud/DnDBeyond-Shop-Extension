/**
 * Popup entry point. Wires the top-level chrome (nav, role toggle,
 * toggle) and boots the Creation / Regular interface modules.
 */

function switchView(view) {
  const isCreation = view === "creation";
  if (isCreation && !Roles.requireDM("The Creation Interface")) return;

  $("#view-regular").toggleClass("hidden", isCreation);
  $("#view-creation").toggleClass("hidden", !isCreation).toggleClass("flex", isCreation);

  $(".nav-tab").each(function () {
    const active = $(this).data("view") === view;
    $(this)
      .toggleClass("border-beyond-red text-beyond-red", active)
      .toggleClass("border-transparent text-beyond-ink/60", !active);
  });

  if (isCreation) {
    Creation.refreshTitleInput();
    Creation.refreshLiveSessionUI(); // J.37 — keep the Go Live / Publish panel in sync with the current draft
  }
}

async function init() {
  await State.hydrate();
  Roles.applyRoleToUI();

  // J.40: clear the "something updated" badge the background poller may
  // have set — the player is looking now, so it's done its job.
  chrome.action.setBadgeText({ text: "" });

  $("#roleToggleBtn").on("click", () => Roles.toggleRole());

  $(".nav-tab").on("click", function () { switchView($(this).data("view")); });

  Creation.init();
  Regular.init();
}

$(init);
