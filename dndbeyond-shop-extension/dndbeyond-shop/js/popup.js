/**
 * Popup entry point. Wires the top-level chrome (nav, role toggle, theme
 * toggle) and boots the Creation / Regular interface modules.
 */

function applyTheme(theme) {
  $("html").toggleClass("dark", theme === "dark");
  $("#themeIcon").text(theme === "dark" ? "☀️" : "🌙");
}

function switchView(view) {
  const isCreation = view === "creation";
  if (isCreation && !Roles.requireDM("The Creation Interface")) return;

  $("#view-regular").toggleClass("hidden", isCreation);
  $("#view-creation").toggleClass("hidden", !isCreation).toggleClass("flex", isCreation);

  $(".nav-tab").each(function () {
    const active = $(this).data("view") === view;
    $(this)
      .toggleClass("border-beyond-red text-beyond-red dark:text-beyond-gold dark:border-beyond-gold", active)
      .toggleClass("border-transparent text-beyond-ink/60 dark:text-beyond-parchment/60", !active);
  });

  if (isCreation) Creation.refreshTitleInput();
}

async function init() {
  await State.hydrate();
  applyTheme(State.getTheme());
  Roles.applyRoleToUI();

  $("#themeToggleBtn").on("click", async () => {
    const next = State.getTheme() === "dark" ? "light" : "dark";
    await State.setTheme(next);
    applyTheme(next);
  });

  $("#roleToggleBtn").on("click", () => Roles.toggleRole());

  $(".nav-tab").on("click", function () { switchView($(this).data("view")); });

  Creation.init();
  Regular.init();
}

$(init);
