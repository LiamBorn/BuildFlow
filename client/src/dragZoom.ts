/**
 * The Dashboard family of pages scales with the window (app-shell-client-desk.css section 42 puts a
 * CSS zoom on the shell). dnd-kit measures the pointer in screen pixels and carries an item by a
 * transform in the page's own, so under zoom the item would trail the hand by the zoom; this
 * modifier divides the transform by it. Drops are untouched wherever collision detection reads the
 * pointer first (the schedule, the Dashboard's cards, the Deals board all do), because dnd-kit never
 * scales pointer coordinates. currentCSSZoom is the browser's word for the factor; where it has none
 * (jsdom, older engines) this is the identity.
 */
import type { ClientRect, DropAnimationKeyframeResolver, Modifier } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

/** The shell's zoom factor, or 1 where the browser has no word for it (jsdom, older engines). */
export function shellZoom(): number {
  const shell =
    typeof document === "undefined" ? null : (document.querySelector(".app-shell") as (Element & { currentCSSZoom?: number }) | null);
  const zoom = shell?.currentCSSZoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
}

export const unzoomDrag: Modifier = ({ transform }) => {
  const zoom = shellZoom();
  if (zoom === 1) return transform;
  return { ...transform, x: transform.x / zoom, y: transform.y / zoom };
};

/**
 * Where a lifted card (a dnd-kit DragOverlay) has to be placed. dnd-kit positions it with the
 * dragged node's `top`, `left`, `width` and `height` as it measured them — screen pixels — and
 * the overlay renders INSIDE the zoomed shell, where every length is multiplied by the zoom a
 * second time. So the card sat a tenth of its distance from the page's corner away from the
 * hand, and a tenth off size. These four are divided for the same reason the pointer delta is.
 */
export function unzoomOverlay(rect: ClientRect | null): CSSProperties | undefined {
  const zoom = shellZoom();
  if (!rect || zoom === 1) return undefined;
  return { top: rect.top / zoom, left: rect.left / zoom, width: rect.width / zoom, height: rect.height / zoom };
}

/** And the drop flight, whose distance dnd-kit also measures on screen and plays as a transform. */
export const unzoomDropFlight: DropAnimationKeyframeResolver = ({ transform: { initial, final } }) => {
  const zoom = shellZoom();
  const landing =
    zoom === 1 ? final : { ...final, x: initial.x + (final.x - initial.x) / zoom, y: initial.y + (final.y - initial.y) / zoom };
  return [{ transform: CSS.Transform.toString(initial) }, { transform: CSS.Transform.toString(landing) }];
};

/** One array for the life of the module: a fresh list each render would re-arm dnd-kit's modifiers. */
export const dragModifiers = [unzoomDrag];
