/**
 * Keyboard re-booking on every schedule board: an arrow key moves a lifted card
 * to the next crew or day (one drop target per press, not a fixed number of
 * pixels), and the live announcements name the job and where it is going.
 */
import type { Active, Announcements, KeyboardCoordinateGetter, Over, ScreenReaderInstructions } from "@dnd-kit/core";

export type DragData = Record<string, unknown> | undefined;

/**
 * One press, one target: the nearest drop target in the arrow's direction,
 * preferring the same row for left/right and the same column for up/down.
 */
export const scheduleKeyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!collisionRect) return undefined;
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: { dx: number; dy: number; score: number } | null = null;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    let score: number | null = null;
    if (event.code === "ArrowRight" && dx > 4) score = Math.abs(dy) * 4 + dx;
    else if (event.code === "ArrowLeft" && dx < -4) score = Math.abs(dy) * 4 - dx;
    else if (event.code === "ArrowDown" && dy > 4) score = Math.abs(dx) * 4 + dy;
    else if (event.code === "ArrowUp" && dy < -4) score = Math.abs(dx) * 4 - dy;
    if (score !== null && (!best || score < best.score)) best = { dx, dy, score };
  }
  if (!best) return undefined;
  return { x: currentCoordinates.x + best.dx, y: currentCoordinates.y + best.dy };
};

/** What a page says about a lifted card and a drop target, from the data the draggable and droppable carry. */
export type DragDescribers = { active: (data: DragData) => string; over: (data: DragData) => string };

/** The `accessibility` prop for a schedule DndContext: announcements that name the job and the day. */
export function scheduleAccessibility(describe: DragDescribers): {
  announcements: Announcements;
  screenReaderInstructions: ScreenReaderInstructions;
} {
  const item = (active: Active) => describe.active(active.data.current as DragData) || "The item";
  const target = (over: Over) => describe.over(over.data.current as DragData) || "a drop area";
  return {
    announcements: {
      onDragStart: ({ active }) =>
        `${item(active)} picked up. Arrow keys move it one crew or day at a time, Space or Enter drops it, Escape cancels.`,
      onDragOver: ({ active, over }) => (over ? `${item(active)} is over ${target(over)}.` : `${item(active)} is not over a drop area.`),
      onDragEnd: ({ active, over }) =>
        over ? `${item(active)} dropped on ${target(over)}.` : `${item(active)} was dropped outside a drop area and stays where it was.`,
      onDragCancel: ({ active }) => `Move cancelled. ${item(active)} stays where it was.`
    },
    screenReaderInstructions: {
      draggable:
        "To move this, press Space or Enter. Each arrow key press moves it one crew or day. Press Space or Enter again to drop it, or Escape to cancel."
    }
  };
}

/** "Wednesday, Sep 9" for a YYYY-MM-DD day, the way the announcements say it. */
export const spokenDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return `${date.toLocaleDateString("en-US", { weekday: "long" })}, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};
