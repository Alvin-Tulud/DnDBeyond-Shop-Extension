/**
 * Creation Interface logic (DM only).
 * Action items: C.8, C.9, C.10, C.11, C.12, C.13, C.14, C.15
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
      ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-beyond-gold/30 text-beyond-ink dark:text-beyond-gold font-semibold">SRD</span>`
      : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-semibold">Custom</span>`;
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

  // Row height for the catalog result buttons: two short text lines + p-2 padding
  // (shorter than the default 84px shop-item card, so pass it explicitly).
  const CATALOG_ROW_HEIGHT = 52;

  function renderCatalogResultRow(item) {
    const costText = formatCost(item.cost) || "—";
    return `
      <button class="catalog-result-item w-full text-left card p-2 hover:border-beyond-red/50 dark:hover:border-beyond-gold/50" data-catalog-id="${item.catalogId}">
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-sm">${UI.escapeHtml(item.name)}</span>
          <span class="text-[11px] opacity-60">${UI.escapeHtml(costText)}</span>
        </div>
        <p class="text-[11px] opacity-60">${UI.escapeHtml(item.type)} · ${UI.escapeHtml(item.rarity)}</p>
      </button>
    `;
  }

  function renderCatalogResults() {
    const query = $("#catalogSearch").val();
    const type = $("#catalogTypeFilter").val();
    const results = Catalog.search(catalogItems, { query, type });
    const $results = $("#catalogResults");
    $("#catalogEmpty").toggleClass("hidden", results.length > 0);
    // Virtualized (same helper the shop item lists use) — no arbitrary cap,
    // so a broad/empty search shows every match instead of silently
    // truncating past a fixed count. Small result sets (<= VIRTUALIZE_THRESHOLD)
    // still render directly with no virtualization overhead.
    renderVirtualList($results, results, renderCatalogResultRow, { rowHeight: CATALOG_ROW_HEIGHT });
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
      UI.showToast(`"${result.data.shop.title}" loaded for editing.`, "success");
    } catch (e) {
      UI.showToast("Could not read that file.", "error");
    } finally {
      $("#creationImportInput").val("");
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
  }

  function init() {
    bindEvents();
    refreshTitleInput();
    renderItemList();
  }

  return { init, renderItemList, refreshTitleInput };
})();
