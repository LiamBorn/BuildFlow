import { describe, expect, it, vi } from "vitest";
import { scheduleCommands } from "./commands";

describe("scheduleCommands", () => {
  it("offers the landing and one entry per view with its key", () => {
    const open = vi.fn();
    const commands = scheduleCommands(open);
    expect(commands.map((command) => command.label)).toEqual([
      "Schedule",
      "Month view",
      "Week view",
      "List view",
      "Gantt Chart view",
      "Kanban view",
      "Matrix view"
    ]);
    expect(commands.slice(1).map((command) => command.hint)).toEqual(["1", "2", "3", "4", "5", "6"]);
    commands[2].run();
    expect(open).toHaveBeenCalledWith("week");
    commands[0].run();
    expect(open).toHaveBeenLastCalledWith("schedule");
  });
});
