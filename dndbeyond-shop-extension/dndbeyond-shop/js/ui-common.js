/**
 * Shared, generic UI helpers used by both Creation and Regular interfaces.
 * Standardized success/error toasts (G.29), modal plumbing, confirm dialog,
 * loading-state indicators (UX Details, I.33), and a relative-time
 * formatter used by Live Share's sync indicators (J.37, J.38).
 */

const UI = (() => {
  function showToast(message, type = "success") {
    const colors = {
      success: "bg-green-700 text-white",
      error: "bg-beyond-red text-white",
      info: "bg-black/80 text-white"
    };
    const $toast = $(`<div class="toast toast-enter ${colors[type] || colors.info}">${escapeHtml(message)}</div>`);
    $("#toastContainer").append($toast);
    setTimeout(() => $toast.fadeOut(200, () => $toast.remove()), 2600);
  }

  function escapeHtml(str) {
    return $("<div>").text(str ?? "").html();
  }

  function openModal(id) {
    $(`#${id}`).removeClass("hidden");
  }
  function closeModal(id) {
    $(`#${id}`).addClass("hidden");
  }

  /**
   * Promise-based confirm dialog, replacing native confirm() for a
   * consistent themed UX. Used for remove-item (C.11), close-tab (D.19b),
   * and end-live-session (J.37).
   */
  function confirm(message) {
    return new Promise((resolve) => {
      $("#confirmMessage").text(message);
      openModal("confirmModal");
      const cleanup = () => {
        $("#confirmYesBtn, #confirmNoBtn").off("click.confirmDialog");
        closeModal("confirmModal");
      };
      $("#confirmYesBtn").on("click.confirmDialog", () => { cleanup(); resolve(true); });
      $("#confirmNoBtn").on("click.confirmDialog", () => { cleanup(); resolve(false); });
    });
  }

  function setLoading($el, isLoading, loadingText = "Loading…") {
    if (isLoading) {
      $el.data("original-html", $el.html());
      $el.prop("disabled", true).html(loadingText);
    } else {
      const original = $el.data("original-html");
      if (original !== undefined) $el.html(original);
      $el.prop("disabled", false);
    }
  }

  /**
   * Formats an ISO timestamp as a short relative string ("just now", "5m
   * ago", "2h ago", "3d ago"). Used by Live Share sync indicators in both
   * the Creation Interface (last published) and Regular Interface (last
   * synced) — J.37, J.38.
   */
  function formatRelativeTime(iso) {
    if (!iso) return "";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  // Wire generic [data-close] buttons on all modals once, at load time
  $(document).on("click", "[data-close]", function () {
    closeModal($(this).data("close"));
  });
  // Click-outside-to-close on overlay itself
  $(document).on("click", ".modal-overlay", function (e) {
    if (e.target === this) $(this).addClass("hidden");
  });

  return { showToast, escapeHtml, openModal, closeModal, confirm, setLoading, formatRelativeTime };
})();
