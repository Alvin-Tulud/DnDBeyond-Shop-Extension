/**
 * Shared, generic UI helpers used by both Creation and Regular interfaces.
 * Standardized success/error toasts (G.29), modal plumbing, confirm dialog,
 * and loading-state indicators (UX Details, I.33).
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
   * consistent themed UX. Used for remove-item (C.11) and close-tab (D.19b).
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

  // Wire generic [data-close] buttons on all modals once, at load time
  $(document).on("click", "[data-close]", function () {
    closeModal($(this).data("close"));
  });
  // Click-outside-to-close on overlay itself
  $(document).on("click", ".modal-overlay", function (e) {
    if (e.target === this) $(this).addClass("hidden");
  });

  return { showToast, escapeHtml, openModal, closeModal, confirm, setLoading };
})();
