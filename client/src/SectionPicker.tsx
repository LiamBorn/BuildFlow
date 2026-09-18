/**
 * "Add a section" — the drawer the Dashboard's "+" opens, on the reference's Widget Center.
 *
 * Every section the board can hold is a card: its icon, its name, what it shows, and a "+" that
 * puts it on the board. A section that was hidden from Customize is the one this exists for —
 * it waits here until it is wanted again. A section already on the board is still listed, so the
 * catalogue reads as complete, but its card says so and offers nothing: the board holds one of
 * each, so there is nothing to add twice. The addable ones come first.
 *
 * Chrome is the notifications drawer's: the same surface, hairline, radius and float shadow,
 * the same header row; only the body is a grid instead of a list.
 */
import { useEffect, useRef, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";

export type SectionOption = {
  id: string;
  title: string;
  /** Where on the page the section belongs: the eyebrow on its card. */
  group: string;
  /** One line on what the section shows. */
  blurb: string;
  icon?: ComponentType<{ size?: number }>;
  onBoard: boolean;
};

export function SectionPicker({
  open,
  options,
  onAdd,
  onClose
}: {
  open: boolean;
  options: SectionOption[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const ordered = [...options].sort((a, b) => Number(a.onBoard) - Number(b.onBoard));
  const available = options.filter((option) => !option.onBoard).length;

  return createPortal(
    <div className="bfsp" role="presentation">
      <button type="button" className="bfsp-scrim" aria-label="Close Add a section" onClick={onClose} />
      <section className="bfsp-drawer" role="dialog" aria-modal="true" aria-labelledby="bfsp-title">
        <header className="bfsp-head">
          <div>
            <h2 id="bfsp-title">Add a section</h2>
            <p className="bfsp-sub">
              {available === 0
                ? "Every section is on the board. Remove one from Customize and it will wait here."
                : `${available} ${available === 1 ? "section is" : "sections are"} off the board and ready to come back.`}
            </p>
          </div>
          <button ref={closeRef} type="button" className="bfsp-close" aria-label="Close Add a section" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="bfsp-grid">
          {ordered.map((option) => {
            const Icon = option.icon;
            return (
              <article key={option.id} className={`bfsp-card${option.onBoard ? " is-on-board" : ""}`} aria-label={option.title}>
                <div className="bfsp-card-top">
                  <span className="bfsp-eyebrow">{option.group}</span>
                  <span className="bfsp-tile" aria-hidden="true">
                    {Icon && <Icon size={18} />}
                  </span>
                </div>
                <h3>{option.title}</h3>
                <p>{option.blurb}</p>
                <div className="bfsp-card-foot">
                  {option.onBoard ? (
                    <span className="bfsp-on-board">
                      <Check size={14} aria-hidden="true" /> On the board
                    </span>
                  ) : (
                    <button type="button" className="bfsp-add" aria-label={`Add ${option.title}`} onClick={() => onAdd(option.id)}>
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>,
    document.body
  );
}
