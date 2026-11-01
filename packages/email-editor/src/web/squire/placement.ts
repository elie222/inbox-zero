type Box = { bottom: number; left: number; right: number; top: number };

/**
 * Places a popover of the given size next to an anchor: below it when it
 * fits inside the bounds, otherwise above, and always clamped horizontally.
 */
export function placePopover({
  anchor,
  align,
  bounds,
  size,
  gap = 8,
}: {
  anchor: Box;
  align: "center" | "start";
  bounds: Box;
  size: { height: number; width: number };
  gap?: number;
}) {
  const preferredLeft =
    align === "center"
      ? anchor.left + (anchor.right - anchor.left) / 2 - size.width / 2
      : anchor.left;
  const below = anchor.bottom + gap;
  const fitsBelow = below + size.height <= bounds.bottom - gap;
  return {
    left: Math.max(
      bounds.left + gap,
      Math.min(preferredLeft, bounds.right - size.width - gap),
    ),
    top: fitsBelow
      ? below
      : Math.max(bounds.top + gap, anchor.top - size.height - gap),
  };
}

/**
 * The part of the viewport where an element's descendants can be seen, after
 * clipping by every scrolling or overflow-hidden ancestor.
 */
export function visibleBounds(element: Element): Box {
  const bounds = {
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
    top: 0,
  };
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const { overflowX, overflowY } = getComputedStyle(ancestor);
    if (overflowX === "visible" && overflowY === "visible") continue;
    const rect = ancestor.getBoundingClientRect();
    bounds.top = Math.max(bounds.top, rect.top);
    bounds.left = Math.max(bounds.left, rect.left);
    bounds.right = Math.min(bounds.right, rect.right);
    bounds.bottom = Math.min(bounds.bottom, rect.bottom);
  }
  return bounds;
}
