import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette, filterCommands, type Command } from "./CommandPalette";

const commands = (run: (id: string) => void): Command[] => [
  { id: "dashboard", label: "Dashboard", group: "Pages", run: () => run("dashboard") },
  { id: "crews", label: "Crews", group: "Pages", keywords: "people teams", run: () => run("crews") },
  { id: "week", label: "Week view", group: "Schedule", hint: "2", run: () => run("week") }
];

describe("CommandPalette", () => {
  it("renders nothing while closed", () => {
    render(<CommandPalette open={false} commands={commands(vi.fn())} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists the commands, filters as you type, and runs the highlighted one on Enter", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open commands={commands(run)} onClose={onClose} />);
    const input = screen.getByRole("combobox");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.change(input, { target: { value: "teams" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["CrewsPages"]);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).toHaveBeenCalledWith("crews");
    expect(onClose).toHaveBeenCalled();
  });

  it("moves with the arrow keys, shows the view keys, and closes on Escape", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open commands={commands(run)} onClose={onClose} />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Week view/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Week view/ }).querySelector("kbd")).toHaveTextContent("2");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).toHaveBeenCalledWith("week");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("matches labels, groups and keywords without caring about case", () => {
    const all = commands(vi.fn());
    expect(filterCommands(all, "").map((command) => command.id)).toEqual(["dashboard", "crews", "week"]);
    expect(filterCommands(all, "SCHED").map((command) => command.id)).toEqual(["week"]);
    expect(filterCommands(all, "nothing here")).toEqual([]);
  });
});
