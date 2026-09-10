import { describe, expect, it } from "vitest";
import type { Active, Over } from "@dnd-kit/core";
import { scheduleAccessibility, scheduleKeyboardCoordinates, spokenDay } from "./dragKeyboard";

// a 2 × 3 grid of drop targets, 100 wide and 40 tall, with the lifted card in the top-left cell
const rect = (left: number, top: number) => ({ left, top, width: 100, height: 40, right: left + 100, bottom: top + 40 });
const cells = new Map([
  ["r0c0", rect(0, 0)],
  ["r0c1", rect(100, 0)],
  ["r0c2", rect(200, 0)],
  ["r1c0", rect(0, 40)],
  ["r1c1", rect(100, 40)],
  ["r1c2", rect(200, 40)]
]);
const context = {
  collisionRect: { left: 10, top: 5, width: 80, height: 30, right: 90, bottom: 35 },
  droppableRects: cells,
  droppableContainers: { getEnabled: () => [...cells.keys()].map((id) => ({ id })) }
};
const press = (code: string) =>
  scheduleKeyboardCoordinates({ code } as KeyboardEvent, {
    active: "card",
    currentCoordinates: { x: 10, y: 5 },
    context: context as never
  });

describe("keyboard re-booking", () => {
  it("moves one drop target per press, staying in the row or column", () => {
    // the card's centre is (50, 20); the next cell to the right is centred on (150, 20)
    expect(press("ArrowRight")).toEqual({ x: 110, y: 5 });
    expect(press("ArrowDown")).toEqual({ x: 10, y: 45 });
    expect(press("ArrowLeft")).toBeUndefined();
    expect(press("ArrowUp")).toBeUndefined();
  });

  it("announces the job and the day, not the ids", () => {
    const { announcements, screenReaderInstructions } = scheduleAccessibility({
      active: (data) => `Pinecrest Mass Excavation with ${data?.crew}`,
      over: (data) => `${data?.crew} on ${spokenDay(String(data?.date))}`
    });
    const active = { id: "a-1", data: { current: { crew: "Trenching Crew 2" } } } as unknown as Active;
    const over = { id: "c-2-2026-09-09", data: { current: { crew: "Backfill Crew 5", date: "2026-09-09" } } } as unknown as Over;
    expect(announcements.onDragStart({ active })).toMatch(/^Pinecrest Mass Excavation with Trenching Crew 2 picked up\./);
    expect(announcements.onDragOver({ active, over })).toBe(
      "Pinecrest Mass Excavation with Trenching Crew 2 is over Backfill Crew 5 on Wednesday, Sep 9."
    );
    expect(announcements.onDragEnd({ active, over })).toBe(
      "Pinecrest Mass Excavation with Trenching Crew 2 dropped on Backfill Crew 5 on Wednesday, Sep 9."
    );
    expect(announcements.onDragEnd({ active, over: null })).toMatch(/stays where it was/);
    expect(announcements.onDragCancel({ active, over: null })).toBe(
      "Move cancelled. Pinecrest Mass Excavation with Trenching Crew 2 stays where it was."
    );
    expect(screenReaderInstructions.draggable).toMatch(/arrow key press moves it one crew or day/);
  });
});
