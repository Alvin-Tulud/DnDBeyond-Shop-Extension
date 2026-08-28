/**
 * Minimal scroll virtualizer for long lists inside the constrained popup
 * viewport. Only kicks in once the list is long enough that rendering
 * every row would be wasteful (small lists just render directly — no
 * point paying virtualization overhead for 5 items).
 *
 * Performance section: "Scrollable item list virtualized if a shop or the
 * SRD catalog grows large."
 */

const VIRTUALIZE_THRESHOLD = 40;
const DEFAULT_ROW_HEIGHT = 84; // px, approximate item card height

/**
 * Renders `items` into `$container` using `renderRow(item, index) -> $el|string`.
 * If items.length <= VIRTUALIZE_THRESHOLD, renders everything directly
 * (simpler, and avoids virtualization jitter for short lists).
 * Otherwise, only renders rows currently in/near the visible viewport.
 */
function renderVirtualList($container, items, renderRow, { rowHeight = DEFAULT_ROW_HEIGHT } = {}) {
  $container.off("scroll.virtual");

  if (items.length <= VIRTUALIZE_THRESHOLD) {
    $container.removeClass("virtual-list");
    $container.html("");
    items.forEach((item, i) => $container.append(renderRow(item, i)));
    return;
  }

  $container.addClass("virtual-list").html("");
  const totalHeight = items.length * rowHeight;
  const $spacer = $('<div class="virtual-list-spacer"></div>').css("height", totalHeight);
  $container.append($spacer);

  function paint() {
    const scrollTop = $container.scrollTop();
    const viewportHeight = $container.height();
    const buffer = 6; // rows of overscan above/below viewport
    const firstIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
    const lastIndex = Math.min(items.length - 1, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer);

    $spacer.find(".virtual-list-row").remove();
    for (let i = firstIndex; i <= lastIndex; i++) {
      const $row = $(renderRow(items[i], i));
      $row.addClass("virtual-list-row").css("top", i * rowHeight);
      $spacer.append($row);
    }
  }

  $container.on("scroll.virtual", debounce(paint, 16));
  paint();
}
