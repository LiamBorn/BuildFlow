/**
 * Whether the person has hidden the icon rail with its arrow. Kept on the device, so the
 * choice survives a reload; the rail's own Show arrow brings it back.
 */
const KEY = "app:rail-hidden";

export function readRailHidden(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeRailHidden(hidden: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (hidden) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* a device that refuses storage keeps the rail choice for the session only */
  }
}
