/* =========================================================================
   The top bar's Preferences panel — the gear's dropdown.

   The gear used to jump straight to the Settings page. It now opens this, and
   the page is still one click away at the foot of the panel, because the panel
   holds the shell's layout choices and the page holds everything else.

   All eight topics from the reference are here, in its order. Six are live. Two
   — Theme Mode and Fonts — are disabled and say why, because this product has
   no dark palette and one font family; see the note at the top of
   preferences.ts. A disabled control that explains itself is the pattern used
   for a locked add-on elsewhere in the app, and it is the honest version of a
   control that cannot work yet.
   ========================================================================= */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Check, ChevronDown, RotateCcw, Settings } from "lucide-react";
import {
  FONT_GROUP_LABELS,
  FONT_OPTIONS,
  THEME_PRESETS,
  fontStack,
  loadFontPreviews,
  themeDot,
  type AppPreferences,
  type FontGroup,
  type FontId,
  type NavbarBehavior,
  type PageLayout,
  type SidebarCollapse,
  type SidebarStyle,
  type ThemeMode,
  type ThemePreset
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
  onApplyPreset,
  onRestoreDefaults,
  isDefault,
  onOpenSettings,
  onClose
}: {
  preferences: AppPreferences;
  onUpdate: (patch: Partial<AppPreferences>) => void;
  onApplyPreset: (preset: ThemePreset) => void;
  onRestoreDefaults: () => void;
  isDefault: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ids = useId();
  const presetId = `${ids}-preset`;
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
      if (!panelRef.current?.contains(event.target as Node)) onClose();
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

      <Field label="Theme Preset" htmlFor={presetId}>
        <div className="pref-select">
          {/* The swatch carries the selected theme's own accent, the way the
              reference's picker does, so the control shows the colour it sets. */}
          <span className="pref-select-dot" style={{ background: themeDot(preferences.preset) }} aria-hidden="true" />
          <select id={presetId} value={preferences.preset} onChange={(event) => onApplyPreset(event.target.value as ThemePreset)}>
            {THEME_PRESETS.map((preset) => (
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

      <Field label="Theme Mode" note="BuildFlow has no dark palette yet, so there is nothing to switch to.">
        <Segmented label="Theme Mode" value={preferences.mode} options={MODE_OPTIONS} disabled onChange={() => undefined} />
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
