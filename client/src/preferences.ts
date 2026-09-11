/* =========================================================================
   The workspace's layout preferences — the model behind the top bar's
   Preferences panel (see PreferencesMenu.tsx).

   WHY THIS IS ITS OWN FILE. App.tsx is ~38,000 lines and is edited by more than
   one person at a time, so a feature that can live outside it does. Everything
   here is pure: types, defaults, presets, and one hook. App.tsx supplies the
   account copy and the save function and renders the panel; nothing else about
   it needs to change.

   WHAT IS REAL AND WHAT IS NOT. Six of the eight preferences take effect the
   moment they change, because each has a live target in the shell: the page's
   measure, the top bar's position, the rail's presentation and how the rail
   reads when collapsed. Two do NOT, and they are marked `locked` rather than
   quietly shipped as controls that do nothing:

     - Theme Mode. There is no dark palette in this product. Not one of the
       sixty stylesheets carries a `prefers-color-scheme` rule, and the only
       dark scope that exists is one decorative band on the marketing page. A
       Light / Dark / System switch would therefore be a switch onto nothing.
     - Fonts. One family is declared five times over and nothing selects
       between families, so there is no second face to choose.

   Both are presented with the reason, which is the pattern this product already
   uses for a locked add-on. A control with no handler is the one thing this
   shell has had to go back and clean up before.
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ThemePreset = "default" | "brutalist" | "soft-pop" | "tangerine";
export type ThemeMode = "light" | "dark" | "system";
export type PageLayout = "centered" | "full";
export type NavbarBehavior = "sticky" | "scroll";
export type SidebarStyle = "inset" | "sidebar" | "floating";
export type SidebarCollapse = "icon" | "offcanvas";

export type AppPreferences = {
  preset: ThemePreset;
  /** Locked: one family ships. Kept in the model so the panel can name it. */
  font: "inter";
  /** Locked: there is no dark palette to switch to. */
  mode: ThemeMode;
  layout: PageLayout;
  navbar: NavbarBehavior;
  sidebar: SidebarStyle;
  collapse: SidebarCollapse;
};

/** The account-level key. Mirrors `dash:layout`'s convention. */
export const PREFERENCES_SETTING = "app:preferences";

export const DEFAULT_PREFERENCES: AppPreferences = {
  preset: "default",
  font: "inter",
  mode: "light",
  layout: "centered",
  navbar: "sticky",
  sidebar: "sidebar",
  collapse: "icon"
};

/**
 * The four themes, and they are now real themes rather than the layout bundles
 * that stood here first. A preset recolours the product; it does not move the
 * layout, which is what the four controls below it are for.
 *
 * `dot` is the swatch the picker shows beside each name, and it is the theme's
 * PAGE accent — the colour a reader will see on buttons, pills and charts.
 *
 * Every value in the stylesheet's theme blocks was sampled out of the reference
 * recording frame by frame rather than guessed, which is how the split below
 * came to light: each theme colours the SHELL and the PAGE differently.
 * Brutalist has a blue rail over a red product; Soft Pop an orange rail over an
 * indigo one; Tangerine a pale rail over terracotta. That maps onto the two
 * token families this codebase already had.
 */
export const THEME_PRESETS: Array<{ id: ThemePreset; label: string; dot: string }> = [
  { id: "default", label: "Default", dot: "#1c1c1a" },
  { id: "brutalist", label: "Brutalist", dot: "#f82b30" },
  { id: "soft-pop", label: "Soft Pop", dot: "#4636df" },
  { id: "tangerine", label: "Tangerine", dot: "#cc533e" }
];

/** The picker's swatch for one theme. */
export const themeDot = (id: ThemePreset): string => THEME_PRESETS.find((theme) => theme.id === id)?.dot ?? "#1c1c1a";

/** The one font that ships, named for the panel rather than hidden from it. */
export const FONT_OPTIONS: Array<{ id: AppPreferences["font"]; label: string }> = [{ id: "inter", label: "Inter" }];

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value);

/** Anything unreadable falls back to the default for that field alone. */
export function parsePreferences(raw: unknown): AppPreferences {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFERENCES;
  const input = raw as Record<string, unknown>;
  return {
    preset: isOneOf(input.preset, ["default", "brutalist", "soft-pop", "tangerine"] as const) ? input.preset : DEFAULT_PREFERENCES.preset,
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
    "data-bf-theme": preferences.preset,
    "data-bf-layout": preferences.layout,
    "data-bf-navbar": preferences.navbar,
    "data-bf-sidebar": preferences.sidebar,
    "data-bf-collapse": preferences.collapse
  };
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

  /** A theme recolours; it deliberately leaves the layout choices alone. */
  const applyPreset = useCallback(
    (id: ThemePreset) => {
      commit({ ...preferences, preset: id });
    },
    [commit, preferences]
  );

  const restoreDefaults = useCallback(() => commit(DEFAULT_PREFERENCES), [commit]);

  const isDefault = useMemo(
    () => (Object.keys(DEFAULT_PREFERENCES) as Array<keyof AppPreferences>).every((key) => preferences[key] === DEFAULT_PREFERENCES[key]),
    [preferences]
  );

  return { preferences, update, applyPreset, restoreDefaults, isDefault };
}
