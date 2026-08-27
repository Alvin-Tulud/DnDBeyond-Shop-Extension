/**
 * Regular (player) Interface logic.
 * Action items: D.16, D.17, D.18, D.19, D.19a, D.19b, D.19c, D.20, D.21, D.22, D.23
 */

const Regular = (() => {

  // ---- D.16 / D.17: upload handler — single or multiple files, bundle-aware ----
  async function handleUpload(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    let successCount = 0;
    const errors = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const result = parseAndValidateShopFile(text); // shared validator, same as C.15 (G.28)
        if (!result.ok) {
          errors.push(`${file.name}: ${result.error}`);
          continue;
        }
        if (result.data.type === "bundle") {
          for (const shop of result.data.shops) {
            await State.upsertShopTab(shop);
            successCount++;
          }
        } else {
          await State.upsertShopTab(result.data.shop);
          successCount++;
        }
      } catch (e) {
        errors.push(`${file.name}: could not be read.`);
      }
    }

    if (successCount > 0) {
      const first = State.getVisibleTabs().sort((a, b) => b.loadOrder - a.loadOrder)[0];
      if (first) State.setActiveShopId(first.shop.id);
      UI.showToast(`Loaded ${successCount} shop${successCount === 1 ? "" : "s"}.`, "success");
    }
    if (errors.length > 0) {
      UI.showToast(errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more error${errors.length - 1 === 1 ? "" : "s"})` : ""), "error");
    }

    $("#uploadInput").val("");
    render();
  }

  // ---- D.20: title collision handling in tab bar ----
  function computeDisplayTitles(tabsList) {
    // tabsList assumed sorted by loadOrder ascending (load/uploader order)
    const seenCounts = {};
    const titleOccurrence = {};
    return tabsList.map((t) => {
      const title = t.shop.title;
      seenCounts[title] = (seenCounts[title] || 0) + 1;
      titleOccurrence[t.shop.id] = seenCounts[title];
      return t;
    }).map((t) => {
      const total = tabsList.filter((x) => x.shop.title === t.shop.title).length;
      const occurrence = titleOccurrence[t.shop.id];
      const displayTitle = total > 1 ? `${t.shop.title} (${occurrence})` : t.shop.title;
      return { ...t, displayTitle };
    });
  }

  // ---- D.19: tab bar rendering ----
  function renderTabBar() {
    const visible = State.getVisibleTabs();
    const withTitles = computeDisplayTitles(visible);
    const $bar = $("#shopTabBar");
    $bar.empty();

    withTitles.forEach((t) => {
      const active = t.shop.id === State.getActiveShopId();
      const $tab = $(`
        <div class="tab-chip ${active ? "active" : ""}" data-shop-id="${t.shop.id}" role="tab" aria-selected="${active}">
          <span class="truncate max-w-[110px]">${UI.escapeHtml(t.displayTitle)}</span>
          <button class="tab-hide-btn opacity-60 hover:opacity-100" title="Hide tab">🙈</button>
          <button class="tab-close-btn opacity-60 hover:opacity-100" title="Close tab">✕</button>
        </div>
      `);
      $bar.append($tab);
    });

    $("#hiddenCount").text(State.getHiddenTabs().length);
  }

  // ---- D.22: player-side search/filter/sort scoped to active tab ----
  function getFilteredSortedItems(shop) {
    const query = $("#regularSearch").val()?.trim().toLowerCase() || "";
    const rarity = $("#regularRarityFilter").val() || "";
    const sort = $("#regularSort").val() || "name-asc";

    let items = shop.items.filter((item) => {
      const matchesQuery = !query || item.name.toLowerCase().includes(query) || (item.description || "").toLowerCase().includes(query);
      const matchesRarity = !rarity || item.rarity === rarity;
      return matchesQuery && matchesRarity;
    });

    items = items.slice().sort((a, b) => {
      switch (sort) {
        case "name-desc": return b.name.localeCompare(a.name);
        case "cost-asc": return costToCopper(a.cost) - costToCopper(b.cost); // shared copper helper, comparison only
        case "cost-desc": return costToCopper(b.cost) - costToCopper(a.cost);
        case "name-asc":
        default: return a.name.localeCompare(b.name);
      }
    });

    return items;
  }

  function populateRarityFilter(shop) {
    const $sel = $("#regularRarityFilter");
    const current = $sel.val();
    const rarities = [...new Set(shop.items.map((i) => i.rarity))].sort();
    $sel.find("option:not(:first)").remove();
    rarities.forEach((r) => $sel.append(`<option value="${UI.escapeHtml(r)}">${UI.escapeHtml(r)}</option>`));
    if (rarities.includes(current)) $sel.val(current);
  }

  function renderItemRow(item) {
    const costText = formatCost(item.cost) || "—";
    const qtyText = item.quantity === null || item.quantity === undefined ? "" : `<span class="text-[11px] opacity-60">Qty: ${item.quantity}</span>`;
    return `
      <div class="card p-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <span class="font-semibold text-sm">${UI.escapeHtml(item.name)}</span>
            <p class="text-[11px] opacity-60">${UI.escapeHtml(item.rarity)} · ${UI.escapeHtml(costText)}</p>
            <p class="text-xs opacity-80 mt-0.5">${UI.escapeHtml(item.description || "")}</p>
          </div>
          ${qtyText}
        </div>
      </div>`;
  }

  // ---- D.21 + D.19c: render active shop title/list, or the correct empty state ----
  function renderActiveShop() {
    const activeId = State.getActiveShopId();
    const tabs = State.getTabs();
    const activeEntry = activeId ? tabs[activeId] : null;

    const hasVisibleTabs = State.getVisibleTabs().length > 0;

    if (!activeEntry || activeEntry.hidden) {
      $("#regularShopHeader, #regularToolbar").addClass("hidden");
      $("#regularItemList").addClass("hidden").empty();
      renderEmptyState();
      return;
    }

    $("#regularEmptyState").addClass("hidden");
    $("#regularShopHeader, #regularToolbar, #regularItemList").removeClass("hidden");

    const shop = activeEntry.shop;
    $("#regularShopTitle").text(shop.title);
    const itemCount = shop.items.length;
    $("#regularShopMeta").text(`${itemCount} item${itemCount === 1 ? "" : "s"}${shop.srdAttribution ? " · includes SRD content" : ""}`);

    populateRarityFilter(shop);
    const items = getFilteredSortedItems(shop);
    if (items.length === 0) {
      $("#regularItemList").html(`<p class="text-xs opacity-60 text-center py-6">No items match your search/filter.</p>`);
    } else {
      renderVirtualList($("#regularItemList"), items, renderItemRow);
    }
  }

  // ---- D.19c: empty-state distinction (no tabs at all vs. hidden-only) ----
  function renderEmptyState() {
    $("#regularEmptyState").removeClass("hidden");
    const hasVisibleTabs = State.getVisibleTabs().length > 0;
    if (hasVisibleTabs) return; // shouldn't happen when this is called, but guard anyway

    const hiddenTabs = State.getHiddenTabs();
    if (hiddenTabs.length === 0) {
      $("#regularEmptyText").html(`No shop loaded yet. Import a shop JSON file from your DM to get started.`);
    } else {
      $("#regularEmptyText").html(
        `No visible shops — you have <strong>${hiddenTabs.length}</strong> hidden. ` +
        `<button id="emptyStateHiddenLink" class="underline font-semibold">View hidden shops</button>`
      );
    }
  }

  function render() {
    renderTabBar();
    renderActiveShop();
  }

  // ---- D.19a: hide-tab control ----
  async function hideTab(shopId) {
    await State.setTabHidden(shopId, true);
    if (State.getActiveShopId() === shopId) {
      const nextVisible = State.getVisibleTabs()[0];
      State.setActiveShopId(nextVisible ? nextVisible.shop.id : null);
    }
    render();
  }

  async function unhideTab(shopId) {
    await State.setTabHidden(shopId, false);
    State.setActiveShopId(shopId);
    render();
  }

  // ---- D.19b: close-tab control (irreversible; confirm first) ----
  async function closeTab(shopId) {
    const entry = State.getTabs()[shopId];
    if (!entry) return;
    const ok = await UI.confirm(`Close "${entry.shop.title}"? This removes it from your view and can't be undone — you'd need to re-import the file to get it back.`);
    if (!ok) return;

    const wasActive = State.getActiveShopId() === shopId;
    await State.closeShopTab(shopId);

    if (wasActive) {
      const nextVisible = State.getVisibleTabs()[0];
      State.setActiveShopId(nextVisible ? nextVisible.shop.id : null);
    }
    render();
    UI.showToast(`"${entry.shop.title}" closed.`, "info");
  }

  function bindEvents() {
    $("#uploadInput").on("change", function () { handleUpload(this.files); });

    $("#shopTabBar").on("click", ".tab-chip", function (e) {
      if ($(e.target).is(".tab-hide-btn, .tab-close-btn")) return;
      State.setActiveShopId($(this).data("shop-id"));
      render();
    });
    $("#shopTabBar").on("click", ".tab-hide-btn", function (e) {
      e.stopPropagation();
      hideTab($(this).closest(".tab-chip").data("shop-id"));
    });
    $("#shopTabBar").on("click", ".tab-close-btn", function (e) {
      e.stopPropagation();
      closeTab($(this).closest(".tab-chip").data("shop-id"));
    });

    $("#regularSearch").on("input", debounce(renderActiveShop, 200)); // I.34 debounce
    $("#regularRarityFilter, #regularSort").on("change", renderActiveShop);
  }

  function init() {
    bindEvents();
    render();
  }

  return { init, render };
})();
