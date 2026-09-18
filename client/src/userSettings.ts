/* The per-person settings bootstrap brings down (`userSettings`), kept where every reader sees
   the same copy: the tutorial's record, the Preferences panel and the panel boards read it, and
   the boards write their own key back the moment it changes, before the account copy is saved
   (so a re-read in the same session sees the change). App.tsx syncs it from every bootstrap. */
let cache: Record<string, string> = {};

export function syncUserSettings(settings: Record<string, string> | undefined) {
  cache = settings ?? {};
}

export function readUserSetting(key: string): string | undefined {
  return cache[key];
}

export function rememberUserSetting(key: string, value: string) {
  cache = { ...cache, [key]: value };
}
