/**
 * Creation Interface logic (DM only).
 * Action items: C.8, C.9, C.10, C.11, C.12, C.13, C.14, C.15
 * Live Share (host side): J.37
 */

const Creation = (() => {
  let catalogItems = [];
  let catalogTypesPopulated = false;

  function draft() { return State.getDraft(); }

  // ---- C.8: bind shop title field to state, persist on change ----
  function bindTitle() {
    $("#creationTitleInput").on("input", debounce(async function () {
      const d = draft();
      d.title = $(this).val();
      d.updatedAt = new Date().toISOString();
      await State.setDraft(d);
    }, 250));
  }

  function refreshTitleInput() {
    $("#creationTitleInput").val(draft().title === "Untitled Shop" ? "" : draft().title);
  }

  // ---- C.13: render the scrollable item list from state (virtualized) ----
  function renderItemList() {
    const items = draft().items;
    const $list = $("#creationItemList");
    const hasItems = items.length > 0;
    $list.toggleClass("hidden", !hasItems);
    $("#creationEmptyState").toggleClass("hidden", hasItems);
    if (!hasItems) return;

    renderVirtualList($list, items, (item) => renderCreationItemRow(item));
    $list.off("click.itemActions").on("click.itemActions", ".item-edit-btn", function () {
      openEditItem($(this).closest("[data-item-id]").data("item-id"));
    });
    $list.on("click.itemActions", ".item-remove-btn", function () {
      removeItem($(this).closest("[data-item-id]").data("item-id"));
    });
  }

  function renderCreationItemRow(item) {
    const costText = formatCost(item.cost) || "No cost set";
    const qtyText = item.quantity === null || item.quantity === undefined ? "—" : item.quantity;
    const sourceTag = item.source === "srd"
      ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-beyond-gold/30 text-beyond-ink font-semibold">SRD</span>`
      : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-black/10 font-semibold">Custom</span>`;
    return `
      <div class="card p-2.5" data-item-id="${item.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-semibold text-sm truncate">${UI.escapeHtml(item.name)}</span>
              ${sourceTag}
            </div>
            <p class="text-[11px] opacity-60">${UI.escapeHtml(item.rarity)} · ${UI.escapeHtml(costText)} · Qty: ${UI.escapeHtml(String(qtyText))}</p>
            <p class="text-xs opacity-80 mt-0.5 line-clamp-2">${UI.escapeHtml(item.description || "")}</p>
          </div>
          <div class="flex flex-col gap-1 shrink-0">
            <button class="item-edit-btn btn-icon text-xs" title="Edit item">✎</button>
            <button class="item-remove-btn btn-icon text-xs" title="Remove item">🗑</button>
          </div>
        </div>
      </div>`;
  }

  // ---- C.9: item picker — SRD catalog search/filter, map result into Item schema ----
  async function openItemPicker() {
    if (!Roles.requireDM("Adding catalog items")) return;
    UI.openModal("itemPickerModal");
    $("#catalogLoading").removeClass("hidden");
    $("#catalogResults").empty();
    try {
      catalogItems = await Catalog.load();
      if (!catalogTypesPopulated) {
        const types = Catalog.distinctTypes(catalogItems);
        const $sel = $("#catalogTypeFilter");
        types.forEach((t) => $sel.append(`<option value="${UI.escapeHtml(t)}">${UI.escapeHtml(t)}</option>`));
        catalogTypesPopulated = true;
      }
      renderCatalogResults();
    } catch (e) {
      UI.showToast(e.message || "Failed to load catalog.", "error");
    } finally {
      $("#catalogLoading").addClass("hidden");
    }
  }

  function renderCatalogResults() {
    const query = $("#catalogSearch").val();
    const type = $("#catalogTypeFilter").val();
    const results = Catalog.search(catalogItems, { query, type });
    const $results = $("#catalogResults");
    $("#catalogEmpty").toggleClass("hidden", results.length > 0);
    $results.empty();
    results.slice(0, 200).forEach((item) => {
      const costText = formatCost(item.cost) || "—";
      $results.append(`
        <button class="catalog-result-item w-full text-left card p-2 hover:border-beyond-red/50" data-catalog-id="${item.catalogId}">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-sm">${UI.escapeHtml(item.name)}</span>
            <span class="text-[11px] opacity-60">${UI.escapeHtml(costText)}</span>
          </div>
          <p class="text-[11px] opacity-60">${UI.escapeHtml(item.type)} · ${UI.escapeHtml(item.rarity)}</p>
        </button>
      `);
    });
  }

  async function addCatalogItemToDraft(catalogId) {
    const catalogItem = catalogItems.find((i) => i.catalogId === catalogId);
    if (!catalogItem) return;
    const item = createItem({
      name: catalogItem.name,
      rarity: catalogItem.rarity,
      description: catalogItem.description,
      cost: catalogItem.cost ? { ...catalogItem.cost } : null,
      quantity: null,
      catalogId: catalogItem.catalogId,
      source: "srd"
    });
    const d = draft();
    d.items.push(item);
    d.updatedAt = new Date().toISOString();
    await State.setDraft(d);
    renderItemList();
    UI.showToast(`${catalogItem.name} added to shop.`, "success");
  }

  // ---- C.10 / C.12: custom item form (also doubles as the edit-item form) ----
  function openCustomItem() {
    if (!Roles.requireDM("Adding a custom item")) return;
    resetCustomItemForm();
    $("#customItemModalTitle").text("Custom Item");
    lockCatalogFields(false);
    UI.openModal("customItemModal");
  }

  function openEditItem(itemId) {
    if (!Roles.requireDM("Editing items")) return;
    const item = draft().items.find((i) => i.id === itemId);
    if (!item) return;
    $("#customItemEditId").val(item.id);
    $("#customItemName").val(item.name);
    $("#customItemRarity").val(item.rarity);
    $("#customItemQuantity").val(item.quantity ?? "");
    $("#customItemDescription").val(item.description || "");
    $("#customItemCostGp").val(item.cost?.gp || "");
    $("#customItemCostSp").val(item.cost?.sp || "");
    $("#customItemCostCp").val(item.cost?.cp || "");
    $("#customItemModalTitle").text(`Edit ${item.source === "srd" ? "Catalog" : "Custom"} Item`);
    // Name/rarity stay locked for SRD-sourced items to preserve catalog identity;
    // cost/quantity/description remain editable for both (per C.12).
    lockCatalogFields(item.source === "srd");
    UI.openModal("customItemModal");
  }

  function lockCatalogFields(locked) {
    $("#customItemName, #customItemRarity").prop("disabled", locked);
  }

  function resetCustomItemForm() {
    $("#customItemForm")[0].reset();
    $("#customItemEditId").val("");
  }

  function readCostFromForm() {
    const gp = parseInt($("#customItemCostGp").val(), 10) || 0;
    const sp = parseInt($("#customItemCostSp").val(), 10) || 0;
    const cp = parseInt($("#customItemCostCp").val(), 10) || 0;
    if (!gp && !sp && !cp) return null;
    return { gp, sp, cp };
  }

  async function submitCustomItemForm(e) {
    e.preventDefault();
    if (!Roles.requireDM("Saving items")) return;
    const editId = $("#customItemEditId").val();
    const name = $("#customItemName").val().trim();
    if (!name) { UI.showToast("Item name is required.", "error"); return; }
    const rarity = $("#customItemRarity").val();
    const description = $("#customItemDescription").val().trim();
    const quantityRaw = $("#customItemQuantity").val();
    const quantity = quantityRaw === "" ? null : Math.max(0, parseInt(quantityRaw, 10) || 0);
    const cost = readCostFromForm();

    const d = draft();
    if (editId) {
      // C.12: edit-item handler (cost/quantity/description after already in list)
      const item = d.items.find((i) => i.id === editId);
      if (!item) { UI.showToast("That item no longer exists.", "error"); return; }
      item.cost = cost;
      item.quantity = quantity;
      item.description = description;
      if (item.source === "custom") {
        item.name = name;
        item.rarity = rarity;
      }
      UI.showToast(`${item.name} updated.`, "success");
    } else {
      // C.10: custom item, source: "custom", no catalogId
      const item = createItem({ name, rarity, description, cost, quantity, catalogId: null, source: "custom" });
      d.items.push(item);
      UI.showToast(`${name} added to shop.`, "success");
    }
    d.updatedAt = new Date().toISOString();
    await State.setDraft(d);
    UI.closeModal("customItemModal");
    renderItemList();
  }

  // ---- C.11: remove-item handler with confirmation ----
  async function removeItem(itemId) {
    if (!Roles.requireDM("Removing items")) return;
    const d = draft();
    const item = d.items.find((i) => i.id === itemId);
    if (!item) return;
    const ok = await UI.confirm(`Remove "${item.name}" from this shop? This cannot be undone.`);
    if (!ok) return;
    d.items = d.items.filter((i) => i.id !== itemId);
    d.updatedAt = new Date().toISOString();
    await State.setDraft(d);
    renderItemList();
    UI.showToast(`${item.name} removed.`, "info");
  }

  // ---- C.14: export function ----
  async function exportShop() {
    if (!Roles.requireDM("Exporting a shop")) return;
    const d = draft();
    if (!d.title || !d.title.trim()) { UI.showToast("Give the shop a title before exporting.", "error"); return; }
    if (d.items.length === 0) {
      const proceed = await UI.confirm("This shop has no items yet. Export anyway?");
      if (!proceed) return;
    }
    d.updatedAt = new Date().toISOString();
    d.srdAttribution = computeSrdAttribution(d); // G.28a
    await State.setDraft(d);

    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(d.title)}.shop.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    UI.showToast("Shop exported.", "success");
  }

  function slugify(text) {
    return (text || "shop").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "shop";
  }

  // ---- C.15: import function (into Creation Interface, for editing) ----
  async function importForEditing(fileList) {
    if (!Roles.requireDM("Importing a shop to edit")) return;
    const file = fileList[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseAndValidateShopFile(text);
      if (!result.ok) { UI.showToast(result.error, "error"); return; }
      if (result.data.type === "bundle") {
        UI.showToast("This is a bundle file with multiple shops — import it from Browse Shops instead, or pick a single-shop export to edit here.", "error");
        return;
      }
      await State.setDraft(result.data.shop);
      refreshTitleInput();
      renderItemList();
      refreshLiveSessionUI(); // the newly-loaded shop may already have a hosted session on record (J.37)
      UI.showToast(`"${result.data.shop.title}" loaded for editing.`, "success");
    } catch (e) {
      UI.showToast("Could not read that file.", "error");
    } finally {
      $("#creationImportInput").val("");
    }
  }

  // ==== J.37: Live Share — host side ====

  function refreshLiveSessionUI() {
    const session = State.getHostedSession(draft().id);
    $("#goLiveBtn").toggleClass("hidden", !!session);
    $("#liveSessionPanel").toggleClass("hidden", !session);
    if (session) {
      $("#liveSessionCode").text(session.sessionId);
      $("#liveSessionMeta").text(`Last published ${UI.formatRelativeTime(session.updatedAt)}. Players join with this code.`);
    }
  }

  async function goLive() {
    if (!Roles.requireDM("Going live")) return;
    const d = draft();
    if (!d.title || !d.title.trim()) { UI.showToast("Give the shop a title before going live.", "error"); return; }
    if (d.items.length === 0) {
      const proceed = await UI.confirm("This shop has no items yet. Go live anyway?");
      if (!proceed) return;
    }
    d.updatedAt = new Date().toISOString();
    d.srdAttribution = computeSrdAttribution(d);
    await State.setDraft(d);

    const $btn = $("#goLiveBtn");
    UI.setLoading($btn, true, "Starting…");
    try {
      const { sessionId, writeToken, updatedAt } = await Session.hostShop(d);
      await State.setHostedSession(d.id, { sessionId, writeToken, updatedAt });
      refreshLiveSessionUI();
      UI.showToast(`Live! Room code: ${sessionId}`, "success");
    } catch (e) {
      UI.showToast(e.message || "Couldn't start a live session.", "error");
    } finally {
      UI.setLoading($btn, false);
    }
  }

  async function publishLiveUpdate() {
    if (!Roles.requireDM("Publishing an update")) return;
    const d = draft();
    const session = State.getHostedSession(d.id);
    if (!session) return;
    d.updatedAt = new Date().toISOString();
    d.srdAttribution = computeSrdAttribution(d);
    await State.setDraft(d);

    const $btn = $("#publishUpdateBtn");
    UI.setLoading($btn, true, "Publishing…");
    try {
      const { updatedAt } = await Session.publishUpdate(session.sessionId, session.writeToken, d);
      await State.setHostedSession(d.id, { ...session, updatedAt });
      refreshLiveSessionUI();
      UI.showToast("Live shop updated.", "success");
    } catch (e) {
      UI.showToast(e.message || "Couldn't publish the update.", "error");
    } finally {
      UI.setLoading($btn, false);
    }
  }

  async function endLiveSession() {
    if (!Roles.requireDM("Ending a live session")) return;
    const d = draft();
    const session = State.getHostedSession(d.id);
    if (!session) return;
    const ok = await UI.confirm(`End the live session (room code ${session.sessionId})? Players who already joined keep the last copy they synced, but won't receive further updates.`);
    if (!ok) return;
    try {
      await Session.endSession(session.sessionId, session.writeToken);
    } catch (e) {
      // Still clear the local record even if the relay call fails, so the DM isn't stuck
      // thinking they're live when they've already tried to end it.
    }
    await State.clearHostedSession(d.id);
    refreshLiveSessionUI();
    UI.showToast("Live session ended.", "info");
  }

  async function copyRoomCode() {
    const session = State.getHostedSession(draft().id);
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.sessionId);
      UI.showToast("Room code copied.", "success");
    } catch (e) {
      UI.showToast(`Room code: ${session.sessionId}`, "info");
    }
  }

  function bindEvents() {
    bindTitle();
    $("#openItemPickerBtn").on("click", openItemPicker);
    $("#openCustomItemBtn").on("click", openCustomItem);
    $("#catalogSearch").on("input", debounce(renderCatalogResults, 200)); // B.6
    $("#catalogTypeFilter").on("change", renderCatalogResults);
    $("#catalogResults").on("click", ".catalog-result-item", function () {
      addCatalogItemToDraft($(this).data("catalog-id"));
    });
    $("#customItemForm").on("submit", submitCustomItemForm);
    $("#exportShopBtn").on("click", exportShop);
    $("#creationImportInput").on("change", function () { importForEditing(this.files); });

    // Live Share (J.37)
    $("#goLiveBtn").on("click", goLive);
    $("#publishUpdateBtn").on("click", publishLiveUpdate);
    $("#endLiveSessionBtn").on("click", endLiveSession);
    $("#copyRoomCodeBtn").on("click", copyRoomCode);
  }

  function init() {
    bindEvents();
    refreshTitleInput();
    renderItemList();
    refreshLiveSessionUI();
  }

  return { init, renderItemList, refreshTitleInput, refreshLiveSessionUI };
})();
