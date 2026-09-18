/* =========================================================================
   The workspace's layout preferences — the model behind the top bar's
   Preferences panel (see PreferencesMenu.tsx).

   WHY THIS IS ITS OWN FILE. App.tsx is ~38,000 lines and is edited by more than
   one person at a time, so a feature that can live outside it does. Everything
   here is pure: types, defaults, presets, and one hook. App.tsx supplies the
   account copy and the save function and renders the panel; nothing else about
   it needs to change.

   COLORS, NOT THEMES (2026-09-16). The panel used to offer five THEMES — whole
   palettes (Default, Dark, Red, Purple, Green) that repainted the product. That
   is gone: the first control is now "Colors", and a colour set only ever
   supplies the HINTS of colour spread through the program — the accent, the
   information / ok / warn / bad tones, the faces, the chart series — while the
   surfaces and the ink stay the same. It is carried on `data-bf-colors`, and the
   skin (app-shell-client-desk.css, section 47) declares every hint token per set.
   "Default" is white, gray and black, no colour at all; "Blue" turns the black
   hints blue, "Red" red, "Green" green and "Yellow" a bright gold on a dark olive-gold for text.
   Light / Dark / System stays a separate control (Theme Mode, `data-bf-mode`).

   ALL EIGHT ARE LIVE. Theme Mode and Fonts each shipped disabled, with the
   reason on the control, because the product had no dark palette and one font
   family. Both have since been built: the fonts load from Google Fonts, and dark
   mode redefines a semantic surface/ink layer (section 29 of the daylight sheet).
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** The colour sets: the hints of colour a workspace shows. */
export type ColorPreset = "default" | "blue" | "red" | "green" | "yellow";
export type FontId =
  | "geist"
  | "inter"
  | "noto-sans"
  | "nunito-sans"
  | "figtree"
  | "roboto"
  | "raleway"
  | "dm-sans"
  | "public-sans"
  | "outfit"
  | "geist-mono"
  | "geist-pixel"
  | "jetbrains-mono"
  | "noto-serif"
  | "roboto-slab"
  | "merriweather"
  | "lora"
  | "playfair-display";
export type ThemeMode = "light" | "dark" | "system";
export type PageLayout = "centered" | "full";
export type NavbarBehavior = "sticky" | "scroll";
export type SidebarStyle = "inset" | "sidebar" | "floating";
export type SidebarCollapse = "icon" | "offcanvas";

export type AppPreferences = {
  /** Which set of colour hints the program shows. */
  colors: ColorPreset;
  /** The typeface the whole product is set in. */
  font: FontId;
  /** Light, dark, or whatever the operating system is asking for. */
  mode: ThemeMode;
  layout: PageLayout;
  navbar: NavbarBehavior;
  sidebar: SidebarStyle;
  collapse: SidebarCollapse;
};

/** The account-level key. Mirrors `dash:layout`'s convention. */
export const PREFERENCES_SETTING = "app:preferences";

export const DEFAULT_PREFERENCES: AppPreferences = {
  colors: "default",
  font: "inter",
  mode: "light",
  layout: "centered",
  navbar: "sticky",
  sidebar: "sidebar",
  collapse: "icon"
};

/**
 * The colour sets the picker offers. `swatch` is what the control shows for one:
 * the three colours a set is made of, so the choice reads before it is made.
 *
 * "Default" is deliberately no colour at all — white, gray and black — so that
 * every hint in the program (the accent, the tones, the faces, the charts) is
 * monochrome. "Blue" (2026-09-16) turns the hints that are black in Default —
 * the accent, its fill and washes, the bad tone, the framing and milestone
 * trades, the selection — blue, and leaves every gray alone. A set is one
 * entry here and one token block in the skin's section 47.
 */
export const COLOR_PRESETS: Array<{ id: ColorPreset; label: string; swatch: [string, string, string] }> = [
  { id: "default", label: "Default", swatch: ["#ffffff", "#9b9b9b", "#1c1c1c"] },
  // Blue: every hint that is black in Default is blue here; the grays stay gray
  { id: "blue", label: "Blue", swatch: ["#ffffff", "#9b9b9b", "#2563eb"] },
  /* Red: the same, plus the one thing Blue never had to do — the `bad` tone moves out of the
     accent's way in the light reading, because a red accent cannot separate from a red alarm by
     hue the way blue does. Skin section 47b carries the numbers and the reasoning. */
  { id: "red", label: "Red", swatch: ["#ffffff", "#9b9b9b", "#c62828"] },
  /* Green: the collision is with `ok` rather than `bad`, and it is the worst of the four (the
     natural green accent IS "on track"). A first pass moved the accent deep instead of the tone;
     that read as near-black in fills, so the accent is vibrant and `ok` moves. Skin section 47c. */
  { id: "green", label: "Green", swatch: ["#ffffff", "#9b9b9b", "#1b7f3b"] },
  /* Yellow is the only set whose TEXT accent and FILL are different colours: a yellow light enough
     to look yellow cannot be text on white, so marks take a dark olive-gold and solids take
     #f2c200 with dark ink. The swatch shows the FILL, because that is the colour a person means
     when they pick "Yellow". It is also the one set where the arithmetic leaves no choice about a
     status tone — `warn` has to move. Skin 47d carries all of it. */
  { id: "yellow", label: "Yellow", swatch: ["#ffffff", "#9b9b9b", "#f2c200"] }
];

/** The picker's three-colour swatch for one set. */
export const colorSwatch = (id: ColorPreset): [string, string, string] =>
  COLOR_PRESETS.find((preset) => preset.id === id)?.swatch ?? COLOR_PRESETS[0].swatch;

/* ── the fonts ───────────────────────────────────────────────────────────────
   The eighteen from the reference recording, in its order and its grouping.

   `family` is the CSS family name and `query` is its Google Fonts request, and
   the two differ in exactly one place: the recording lists "Geist Pixel Square",
   which is not a family. Google Fonts publishes "Geist Pixel" with a custom ELSH
   axis (element shape, 0-100, default 0) and the square pixel is that axis at 0 —
   so the label follows the recording and the request asks for the axis. Checked
   against the live catalogue rather than assumed: 17 of the 18 names resolve
   directly, and that one resolves through the axis.

   `stack` is what actually ships in the token, so a face that has not downloaded
   yet, or fails to, falls back inside its own genre instead of to a default serif. */
export type FontGroup = "sans" | "mono" | "serif";

export type FontChoice = { id: FontId; label: string; family: string; query: string; group: FontGroup };

const SANS_FALLBACK = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", Times, serif';

export const FONT_OPTIONS: FontChoice[] = [
  { id: "geist", label: "Geist", family: "Geist", query: "Geist:wght@400..700", group: "sans" },
  { id: "inter", label: "Inter", family: "Inter", query: "Inter:wght@400..700", group: "sans" },
  { id: "noto-sans", label: "Noto Sans", family: "Noto Sans", query: "Noto+Sans:wght@400..700", group: "sans" },
  { id: "nunito-sans", label: "Nunito Sans", family: "Nunito Sans", query: "Nunito+Sans:wght@400..700", group: "sans" },
  { id: "figtree", label: "Figtree", family: "Figtree", query: "Figtree:wght@400..700", group: "sans" },
  { id: "roboto", label: "Roboto", family: "Roboto", query: "Roboto:wght@400..700", group: "sans" },
  { id: "raleway", label: "Raleway", family: "Raleway", query: "Raleway:wght@400..700", group: "sans" },
  { id: "dm-sans", label: "DM Sans", family: "DM Sans", query: "DM+Sans:wght@400..700", group: "sans" },
  { id: "public-sans", label: "Public Sans", family: "Public Sans", query: "Public+Sans:wght@400..700", group: "sans" },
  { id: "outfit", label: "Outfit", family: "Outfit", query: "Outfit:wght@400..700", group: "sans" },
  { id: "geist-mono", label: "Geist Mono", family: "Geist Mono", query: "Geist+Mono:wght@400..700", group: "mono" },
  { id: "geist-pixel", label: "Geist Pixel Square", family: "Geist Pixel", query: "Geist+Pixel:ELSH@0", group: "mono" },
  { id: "jetbrains-mono", label: "JetBrains Mono", family: "JetBrains Mono", query: "JetBrains+Mono:wght@400..700", group: "mono" },
  { id: "noto-serif", label: "Noto Serif", family: "Noto Serif", query: "Noto+Serif:wght@400..700", group: "serif" },
  { id: "roboto-slab", label: "Roboto Slab", family: "Roboto Slab", query: "Roboto+Slab:wght@400..700", group: "serif" },
  { id: "merriweather", label: "Merriweather", family: "Merriweather", query: "Merriweather:wght@400..700", group: "serif" },
  { id: "lora", label: "Lora", family: "Lora", query: "Lora:wght@400..700", group: "serif" },
  { id: "playfair-display", label: "Playfair Display", family: "Playfair Display", query: "Playfair+Display:wght@400..700", group: "serif" }
];

const FALLBACK: Record<FontGroup, string> = { sans: SANS_FALLBACK, mono: MONO_FALLBACK, serif: SERIF_FALLBACK };

export const fontById = (id: FontId): FontChoice => FONT_OPTIONS.find((font) => font.id === id) ?? FONT_OPTIONS[1];

/** The value the token carries: the face, then the rest of its own genre. */
export const fontStack = (id: FontId): string => {
  const font = fontById(id);
  return `"${font.family}", ${FALLBACK[font.group]}`;
};

export const FONT_GROUP_LABELS: Record<FontGroup, string> = { sans: "Sans", mono: "Mono", serif: "Serif" };

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value);

/** Anything unreadable falls back to the default for that field alone. */
export function parsePreferences(raw: unknown): AppPreferences {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFERENCES;
  const input = raw as Record<string, unknown>;
  return {
    // a copy saved before 2026-09-16 carries `preset` (a theme); it is ignored, there are no themes
    colors: isOneOf(input.colors, ["default", "blue"] as const) ? input.colors : DEFAULT_PREFERENCES.colors,
    font: "inter",
    mode: isOneOf(input.mode, ["light", "dark", "system"] as const) ? input.mode : DEFAULT_PREFERENCES.mode,
    layout: isOneOf(input.layout, ["centered", "full"] as const) ? input.layout : DEFAULT_PREFERENCES.layout,
    navbar: isOneOf(input.navbar, ["sticky", "scroll"] as const) ? input.navbar : DEFAULT_PREFERENCES.navbar,
    sidebar: isOneOf(input.sidebar, ["inset", "sidebar", "floating"] as const) ? input.sidebar : DEFAULT_PREFERENCES.sidebar,
    collapse: isOneOf(input.collapse, ["icon", "offcanvas"] as const) ? input.collapse : DEFAULT_PREFERENCES.collapse
  };
}

/**
 * What the shell reads. Returned as data attributes rather than classes so the
 * CSS says which preference it is answering — `[data-bf-sidebar="floating"]`
 * reads as a setting, `.floating` reads as anything at all.
 */
export function preferenceAttributes(preferences: AppPreferences): Record<string, string> {
  return {
    "data-bf-colors": preferences.colors,
    "data-bf-font": preferences.font,
    "data-bf-mode": preferences.mode,
    "data-bf-layout": preferences.layout,
    "data-bf-navbar": preferences.navbar,
    "data-bf-sidebar": preferences.sidebar,
    "data-bf-collapse": preferences.collapse
  };
}

/* ── loading the faces ───────────────────────────────────────────────────────
   index.html preconnects to Google Fonts and never linked a stylesheet, so no
   webfont was ever fetched: "Inter" in every stack was decoration and the
   product has been rendering in the system UI face all along. These two links
   are what make the choice real.

   TWO REQUESTS, FOR TWO DIFFERENT JOBS.

   The SELECTED face is requested in full, at the weight range the product uses
   (400-700). One family, under a kilobyte of CSS.

   The PICKER needs all eighteen at once, because the reference renders each name
   in its own typeface and that is the only way to choose one by eye. Eighteen
   full families would be a heavy download for a dropdown, so they are requested
   with `text=`, which returns only the glyphs those eighteen NAMES need — one
   request, about 5KB of CSS for all of them. The subset is loaded once, lazily,
   the first time the panel opens rather than on boot.
   ------------------------------------------------------------------------- */

const FONT_LINK_ID = "bf-font-active";
const FONT_PREVIEW_LINK_ID = "bf-font-preview";

/** Swap the one <link> that carries the chosen face. */
export function loadFont(id: FontId): void {
  if (typeof document === "undefined") return;
  const href = `https://fonts.googleapis.com/css2?family=${fontById(id).query}&display=swap`;
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

/**
 * The eighteen faces at name-glyph subset, for the picker's previews. Loaded at
 * most once: the link's presence is the guard.
 */
export function loadFontPreviews(): void {
  if (typeof document === "undefined" || document.getElementById(FONT_PREVIEW_LINK_ID)) return;
  // only the characters the eighteen names are spelled with
  const glyphs = [...new Set(FONT_OPTIONS.map((font) => font.label).join(""))].join("");
  const families = FONT_OPTIONS.map((font) => `family=${font.query.split(":")[0]}`).join("&");
  const link = document.createElement("link");
  link.id = FONT_PREVIEW_LINK_ID;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&text=${encodeURIComponent(glyphs)}&display=swap`;
  document.head.appendChild(link);
}

/**
 * The account copy first, mirrored onto this device, then the device's own —
 * the same order `usePersistentLayout` uses, and for the same reason: a second
 * device opens to the same shell, and this one keeps its choice when the API is
 * slow or absent.
 */
export function usePreferences(remote: string | undefined, storageKey: string, save: (key: string, value: string) => Promise<unknown>) {
  const read = useCallback((): AppPreferences => {
    if (remote) {
      try {
        const parsed = parsePreferences(JSON.parse(remote));
        try {
          localStorage.setItem(storageKey, remote);
        } catch {
          /* private mode: the account copy still stands */
        }
        return parsed;
      } catch {
        /* an unreadable account copy: fall through to the device copy */
      }
    }
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? parsePreferences(JSON.parse(raw)) : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }, [remote, storageKey]);

  const [preferences, setPreferences] = useState<AppPreferences>(read);

  // The account copy arrives with the bootstrap payload, which lands after the
  // first paint, so adopt it when it does — but only while this device has no
  // choice of its own, or a stale account copy would undo a fresh click.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setPreferences(read());
  }, [read]);

  // The chosen face is fetched as soon as it is known, and again whenever it
  // changes. Nothing else in the app has to know that a font needs loading.
  useEffect(() => {
    loadFont(preferences.font);
  }, [preferences.font]);

  // One save per burst: clicking through a segmented control is several changes
  // in a second, and each one should not be its own request.
  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const flush = useCallback(() => {
    timer.current = null;
    const value = pending.current;
    pending.current = null;
    if (value === null) return;
    // fire-and-forget: a failed save leaves the device copy, and the next change retries
    save(PREFERENCES_SETTING, value).catch(() => undefined);
  }, [save]);

  const commit = useCallback(
    (next: AppPreferences) => {
      touched.current = true;
      setPreferences(next);
      const value = JSON.stringify(next);
      try {
        localStorage.setItem(storageKey, value);
      } catch {
        /* private mode: the choice just does not outlive the tab */
      }
      pending.current = value;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 500);
    },
    [flush, storageKey]
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      flush();
    },
    [flush]
  );

  const update = useCallback(
    (patch: Partial<AppPreferences>) => {
      commit({ ...preferences, ...patch });
    },
    [commit, preferences]
  );

  /** A colour set recolours the hints; it deliberately leaves the layout choices alone. */
  const applyColors = useCallback(
    (id: ColorPreset) => {
      commit({ ...preferences, colors: id });
    },
    [commit, preferences]
  );

  const restoreDefaults = useCallback(() => commit(DEFAULT_PREFERENCES), [commit]);

  const isDefault = useMemo(
    () => (Object.keys(DEFAULT_PREFERENCES) as Array<keyof AppPreferences>).every((key) => preferences[key] === DEFAULT_PREFERENCES[key]),
    [preferences]
  );

  return { preferences, update, applyColors, restoreDefaults, isDefault };
}
