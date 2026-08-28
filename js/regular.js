/**
 * Regular (player) Interface logic.
 * Action items: D.16, D.17, D.18, D.19, D.19b, D.20, D.21, D.22, D.23
 * Live Share (player side): J.38, J.41
 *
 * Round 7: hide/unhide removed — closing (D.19b) is now the only way to
 * remove a loaded shop from view. See state.js and the spec doc.
 */

const Regular = (() => {

  // ---- D.16 / D.17: upload handler — single or multiple files, bundle-aware ----
  // J.41: if a file would overwrite a tab that's currently live-synced to a
  // session, warn before silently disconnecting it from that sync.
  async function upsertFileShop(shop) {
    const existing = State.getTabs()[shop.id];
    if (existing && existing.source === "session") {
      const ok = await UI.confirm(
        `"${existing.shop.title}" is live-synced to session ${existing.sessionId}. Uploading this file will disconnect it from live sync and replace it with the file's contents — continue?`
      );
      if (!ok) return false;
    }
    await State.upsertShopTab(shop, { source: "file", sessionId: null, lastSyncedAt: null, sessionUpdatedAt: null });
    return true;
  }

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
            if (await upsertFileShop(shop)) successCount++;
          }
        } else {
          if (await upsertFileShop(result.data.shop)) successCount++;
        }
      } catch (e) {
        errors.push(`${file.name}: could not be read.`);
      }
    }

    if (successCount > 0) {
      const first = State.getSortedTabs().sort((a, b) => b.loadOrder - a.loadOrder)[0];
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
    const sorted = State.getSortedTabs();
    const withTitles = computeDisplayTitles(sorted);
    const $bar = $("#shopTabBar");
    $bar.empty();

    withTitles.forEach((t) => {
      const active = t.shop.id === State.getActiveShopId();
      const liveMarker = t.source === "session"
        ? `<span class="text-[10px]" title="Live synced">📡</span>`
        : "";
      const $tab = $(`
        <div class="tab-chip ${active ? "active" : ""}" data-shop-id="${t.shop.id}" role="tab" aria-selected="${active}">
          ${liveMarker}
          <span class="truncate max-w-[110px]">${UI.escapeHtml(t.displayTitle)}</span>
          <button class="tab-close-btn opacity-60 hover:opacity-100" title="Close tab">✕</button>
        </div>
      `);
      $bar.append($tab);
    });
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

  // ---- D.21: render active shop title/list, or the empty state ----
  function renderActiveShop() {
    const activeId = State.getActiveShopId();
    const tabs = State.getTabs();
    const activeEntry = activeId ? tabs[activeId] : null;

    if (!activeEntry) {
      $("#regularShopHeader, #regularToolbar").addClass("hidden");
      $("#regularItemList").addClass("hidden").empty();
      $("#refreshSessionBtn").addClass("hidden");
      $("#regularEmptyState").removeClass("hidden");
      return;
    }

    $("#regularEmptyState").addClass("hidden");
    $("#regularShopHeader, #regularToolbar, #regularItemList").removeClass("hidden");

    const shop = activeEntry.shop;
    $("#regularShopTitle").text(shop.title);
    const itemCount = shop.items.length;
    const metaParts = [`${itemCount} item${itemCount === 1 ? "" : "s"}`];
    if (shop.srdAttribution) metaParts.push("includes SRD content");
    if (activeEntry.source === "session") metaParts.push(`live · synced ${UI.formatRelativeTime(activeEntry.lastSyncedAt)}`);
    $("#regularShopMeta").text(metaParts.join(" · "));
    $("#refreshSessionBtn").toggleClass("hidden", activeEntry.source !== "session");

    populateRarityFilter(shop);
    const items = getFilteredSortedItems(shop);
    if (items.length === 0) {
      $("#regularItemList").html(`<p class="text-xs opacity-60 text-center py-6">No items match your search/filter.</p>`);
    } else {
      renderVirtualList($("#regularItemList"), items, renderItemRow);
    }
  }

  function render() {
    renderTabBar();
    renderActiveShop();
  }

  // ---- D.19b: close-tab control (irreversible; confirm first) ----
  async function closeTab(shopId) {
    const entry = State.getTabs()[shopId];
    if (!entry) return;
    const message = entry.source === "session"
      ? `Leave "${entry.shop.title}"? This removes it from your view and stops syncing — you'd need to rejoin with the room code to get it back.`
      : `Close "${entry.shop.title}"? This removes it from your view and can't be undone — you'd need to re-import the file to get it back.`;
    const ok = await UI.confirm(message);
    if (!ok) return;

    const wasActive = State.getActiveShopId() === shopId;
    await State.closeShopTab(shopId);

    if (wasActive) {
      const nextTab = State.getSortedTabs()[0];
      State.setActiveShopId(nextTab ? nextTab.shop.id : null);
    }
    render();
    UI.showToast(`"${entry.shop.title}" closed.`, "info");
  }

  // ==== J.38: Live Share — player side ====

  async function joinSession() {
    const codeRaw = $("#joinSessionCode").val();
    const code = (codeRaw || "").trim().toUpperCase();
    if (!code) { UI.showToast("Enter a room code first.", "error"); return; }

    const $btn = $("#joinSessionBtn");
    UI.setLoading($btn, true, "Joining…");
    try {
      const result = await Session.fetchLatest(code);
      if (!result) { UI.showToast("No live session found for that code.", "error"); return; }
      validateShop(result.shop); // same validation logic as a file import (G.28)
      await State.upsertShopTab(result.shop, {
        source: "session",
        sessionId: code,
        lastSyncedAt: new Date().toISOString(),
        sessionUpdatedAt: result.updatedAt
      });
      State.setActiveShopId(result.shop.id);
      $("#joinSessionCode").val("");
      UI.showToast(`Joined "${result.shop.title}".`, "success");
      render();
    } catch (e) {
      UI.showToast(e.message || "Couldn't join that session.", "error");
    } finally {
      UI.setLoading($btn, false);
    }
  }

  async function refreshActiveSessionTab() {
    const activeId = State.getActiveShopId();
    const entry = activeId ? State.getTabs()[activeId] : null;
    if (!entry || entry.source !== "session") return;

    const $btn = $("#refreshSessionBtn");
    UI.setLoading($btn, true, "…");
    try {
      const result = await Session.fetchLatest(entry.sessionId);
      if (!result) {
        UI.showToast("This live session is no longer available — the DM may have ended it.", "error");
        return;
      }
      validateShop(result.shop);
      const changed = result.updatedAt !== entry.sessionUpdatedAt;
      await State.upsertShopTab(result.shop, {
        source: "session",
        sessionId: entry.sessionId,
        lastSyncedAt: new Date().toISOString(),
        sessionUpdatedAt: result.updatedAt
      });
      UI.showToast(changed ? "Shop updated." : "Already up to date.", changed ? "success" : "info");
      render();
    } catch (e) {
      UI.showToast(e.message || "Couldn't check for updates.", "error");
    } finally {
      UI.setLoading($btn, false);
    }
  }

  function bindEvents() {
    $("#uploadInput").on("change", function () { handleUpload(this.files); });

    $("#shopTabBar").on("click", ".tab-chip", function (e) {
      if ($(e.target).is(".tab-close-btn")) return;
      State.setActiveShopId($(this).data("shop-id"));
      render();
    });
    $("#shopTabBar").on("click", ".tab-close-btn", function (e) {
      e.stopPropagation();
      closeTab($(this).closest(".tab-chip").data("shop-id"));
    });

    $("#regularSearch").on("input", debounce(renderActiveShop, 200)); // I.34 debounce
    $("#regularRarityFilter, #regularSort").on("change", renderActiveShop);

    // Live Share (J.38)
    $("#joinSessionBtn").on("click", joinSession);
    $("#joinSessionCode").on("keydown", function (e) { if (e.key === "Enter") joinSession(); });
    $("#refreshSessionBtn").on("click", refreshActiveSessionTab);
  }

  function init() {
    bindEvents();
    render();
  }

  return { init, render };
})();
