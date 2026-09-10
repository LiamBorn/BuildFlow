/**
 * The ⌘K palette: type to filter, arrows to move, Enter to run, Escape to close.
 * Commands are plain objects, so any part of the app can contribute its own.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type Command = {
  id: string;
  label: string;
  /** A key shown beside the command (the schedule views' 1–6). */
  hint?: string;
  group?: string;
  /** Extra words the filter matches on. */
  keywords?: string;
  run: () => void;
};

/** The commands whose label, group or keywords contain the query (all of them for an empty query). */
export function filterCommands(commands: Command[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  return commands.filter((command) => `${command.label} ${command.group ?? ""} ${command.keywords ?? ""}`.toLowerCase().includes(needle));
}

export function CommandPalette({
  open,
  commands,
  onClose,
  placeholder = "Jump to a page or a view…"
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => filterCommands(commands, query), [commands, query]);
  const active = matches[Math.min(index, Math.max(0, matches.length - 1))];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const run = (command: Command) => {
    onClose();
    command.run();
  };
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active) run(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="cmdk-input"
          role="combobox"
          aria-label="Search pages and views"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="cmdk-list"
          aria-activedescendant={active ? `cmdk-${active.id}` : undefined}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
        />
        <ul className="cmdk-list" id="cmdk-list" role="listbox">
          {matches.length === 0 && <li className="cmdk-empty">Nothing matches “{query}”</li>}
          {matches.map((command) => (
            <li
              key={command.id}
              id={`cmdk-${command.id}`}
              role="option"
              aria-selected={command === active}
              className={`cmdk-item${command === active ? " is-active" : ""}`}
              onMouseEnter={() => setIndex(matches.indexOf(command))}
              onClick={() => run(command)}
            >
              <span className="cmdk-label">{command.label}</span>
              {command.group && <span className="cmdk-group">{command.group}</span>}
              {command.hint && <kbd className="cmdk-hint">{command.hint}</kbd>}
            </li>
          ))}
        </ul>
        <footer className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  );
}
