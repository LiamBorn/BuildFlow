/* =========================================================================
   The top bar's Preferences panel — the gear's dropdown.

   The gear used to jump straight to the Settings page. It now opens this, and
   the page is still one click away at the foot of the panel, because the panel
   holds the shell's layout choices and the page holds everything else.

   All eight topics from the reference are here, in its order, and all eight are
   live. Theme Mode and Fonts each shipped disabled with the reason on the
   control, which was the honest version of something not yet built; both have
   since been built, so the reasons are gone rather than left to go stale.
   ========================================================================= */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Check, ChevronDown, RotateCcw, Settings } from "lucide-react";
import { isInOwnPopup } from "./components/ui/selectMenu";
import {
  FONT_GROUP_LABELS,
  FONT_OPTIONS,
  COLOR_PRESETS,
  fontStack,
  loadFontPreviews,
  colorSwatch,
  type AppPreferences,
  type FontGroup,
  type FontId,
  type NavbarBehavior,
  type PageLayout,
  type SidebarCollapse,
  type SidebarStyle,
  type ThemeMode,
  type ColorPreset
} from "./preferences";

/** One labelled block: the topic name over its control. */
function Field({ label, htmlFor, children, note }: { label: string; htmlFor?: string; children: ReactNode; note?: string }) {
  return (
    <div className="pref-field">
      {htmlFor ? (
        <label className="pref-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="pref-label">{label}</span>
      )}
      {children}
      {note && <p className="pref-note">{note}</p>}
    </div>
  );
}

/**
 * The reference's segmented control. A radiogroup rather than a row of buttons:
 * these are one choice out of two or three, which is what a radiogroup is, and
 * it gets arrow-key movement between the options for free from the browser.
 */
function Segmented<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="pref-segmented" role="radiogroup" aria-label={label} data-disabled={disabled ? "true" : undefined}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          className="pref-seg"
          aria-checked={value === option.id}
          disabled={disabled}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const MODE_OPTIONS: Array<{ id: ThemeMode; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" }
];
const LAYOUT_OPTIONS: Array<{ id: PageLayout; label: string }> = [
  { id: "centered", label: "Centered" },
  { id: "full", label: "Full Width" }
];
const NAVBAR_OPTIONS: Array<{ id: NavbarBehavior; label: string }> = [
  { id: "sticky", label: "Sticky" },
  { id: "scroll", label: "Scroll" }
];
const SIDEBAR_OPTIONS: Array<{ id: SidebarStyle; label: string }> = [
  { id: "inset", label: "Inset" },
  { id: "sidebar", label: "Sidebar" },
  { id: "floating", label: "Floating" }
];
const COLLAPSE_OPTIONS: Array<{ id: SidebarCollapse; label: string }> = [
  { id: "icon", label: "Icon" },
  { id: "offcanvas", label: "OffCanvas" }
];

export function PreferencesMenu({
  preferences,
  onUpdate,
  onApplyColors,
  onRestoreDefaults,
  isDefault,
  onOpenSettings,
  onClose
}: {
  preferences: AppPreferences;
  onUpdate: (patch: Partial<AppPreferences>) => void;
  onApplyColors: (colors: ColorPreset) => void;
  onRestoreDefaults: () => void;
  isDefault: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ids = useId();
  const colorsId = `${ids}-colors`;
  const fontId = `${ids}-font`;

  // The eighteen preview faces are only needed once this panel exists, so they
  // are fetched here rather than costing every page load a request.
  useEffect(() => {
    loadFontPreviews();
  }, []);

  // Escape closes it, and so does a click outside. Both are what the account
  // menu beside it already does, so the two dropdowns behave the same way.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: MouseEvent) => {
      /* "Outside" means outside the whole ANCHOR — the gear that opens this panel sits
         in it too. Measuring only the panel made the gear a one-way switch: its press
         closed the panel here, and then its own click toggled the state back to open, so
         the panel appeared stuck and could only be dismissed by clicking elsewhere. The
         account menu beside it scopes its dismiss to its wrapper for the same reason. */
      /* ...AND NOT THE PROGRAM'S OWN POPUPS. Colors and Fonts are `<select>`s, and their
         list is drawn by selectMenu.tsx into the BODY — outside this panel's anchor. So
         pressing an option used to dismiss the panel on `mousedown`, taking the `<select>`
         with it, and the write-back on the following `click` then fired `change` at a
         detached node: the dropdown opened, an option was pressed, and nothing changed.
         Reported 2026-09-18 with a recording of exactly that. */
      if (isInOwnPopup(event.target)) return;
      const anchor = panelRef.current?.parentElement ?? panelRef.current;
      if (!anchor?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div className="pref-menu" ref={panelRef} role="dialog" aria-label="Preferences">
      <header className="pref-head">
        <h2>Preferences</h2>
        <p>Customize your dashboard layout preferences.</p>
      </header>

      <Field label="Colors" htmlFor={colorsId}>
        <div className="pref-select">
          {/* The swatch shows the three colours the selected set is made of — for the
              Default set, white, gray and black — so the control shows what it sets. */}
          <span
            className="pref-select-dot is-colors"
            style={{
              background: `conic-gradient(${colorSwatch(preferences.colors)
                .map((tone, index) => `${tone} ${index * 120}deg ${(index + 1) * 120}deg`)
                .join(", ")})`
            }}
            aria-hidden="true"
          />
          <select id={colorsId} value={preferences.colors} onChange={(event) => onApplyColors(event.target.value as ColorPreset)}>
            {COLOR_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
      </Field>

      <Field label="Fonts" htmlFor={fontId}>
        <div className="pref-select">
          <span className="pref-select-face" aria-hidden="true">
            Aa
          </span>
          <select id={fontId} value={preferences.font} onChange={(event) => onUpdate({ font: event.target.value as FontId })}>
            {(["sans", "mono", "serif"] as FontGroup[]).map((group) => (
              <optgroup key={group} label={FONT_GROUP_LABELS[group]}>
                {FONT_OPTIONS.filter((font) => font.group === group).map((font) => (
                  /* Each name is set in its own face, the way the reference's list is —
                     which is the only way to pick a typeface by looking at it. The faces
                     behind these come from a glyph subset covering just these names. */
                  <option key={font.id} value={font.id} style={{ fontFamily: fontStack(font.id) }}>
                    {font.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
      </Field>

      <Field label="Theme Mode">
        <Segmented label="Theme Mode" value={preferences.mode} options={MODE_OPTIONS} onChange={(mode) => onUpdate({ mode })} />
      </Field>

      <Field label="Page Layout">
        <Segmented label="Page Layout" value={preferences.layout} options={LAYOUT_OPTIONS} onChange={(layout) => onUpdate({ layout })} />
      </Field>

      <Field label="Navbar Behavior">
        <Segmented
          label="Navbar Behavior"
          value={preferences.navbar}
          options={NAVBAR_OPTIONS}
          onChange={(navbar) => onUpdate({ navbar })}
        />
      </Field>

      <Field label="Sidebar Style">
        <Segmented
          label="Sidebar Style"
          value={preferences.sidebar}
          options={SIDEBAR_OPTIONS}
          onChange={(sidebar) => onUpdate({ sidebar })}
        />
      </Field>

      <Field label="Sidebar Collapse Mode">
        <Segmented
          label="Sidebar Collapse Mode"
          value={preferences.collapse}
          options={COLLAPSE_OPTIONS}
          onChange={(collapse) => onUpdate({ collapse })}
        />
      </Field>

      <button className="pref-restore" type="button" onClick={onRestoreDefaults} disabled={isDefault}>
        {isDefault ? <Check size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
        {isDefault ? "Already the defaults" : "Restore Defaults"}
      </button>

      <button
        className="pref-full"
        type="button"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
      >
        <Settings size={15} aria-hidden="true" />
        Open full settings
      </button>
    </div>
  );
}
