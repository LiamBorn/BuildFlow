/**
 * Which notifications a person has SEEN and which they have READ, kept on the server so the bell and
 * the Mac agree (notch plan, step 3). It used to live only in the browser's storage.
 *
 * Two things, as the bell has always had them: SEEN is what its badge counts (opening the drawer shows
 * you everything in it); READ is per row (the dot, "Unread only"). Marking read implies seen.
 *
 * WHERE IT IS KEPT. One per-person setting, `notifications:state`, in the same table as the tutorial
 * record and the saved boards (PUT /api/me/settings/:key; bootstrap brings it down in `userSettings`).
 * That route takes 8,000 characters, and the bell lists every booking a workspace ever made, so the
 * value is compact:
 *
 * - each id is a 30-bit hash written as 5 characters (a new notification being mistaken for one
 *   already seen is about one in a million at 1,500 remembered);
 * - READ is a bitmap over the sorted SEEN list, so it costs a sixth of a character per notification;
 * - it only remembers notifications that are still listed — the server prunes to its own list as it
 *   merges, so a booking deleted a year ago is not carried forever;
 * - and if a very long list still does not fit, the OLDEST are folded into a watermark, `t`: every
 *   notification stamped at or before it counts as seen and read. That is the one place it can be
 *   wrong — an old notification that was never opened reads as read — and it only happens past about
 *   1,400 remembered notifications, to the oldest of them.
 *
 * Writes MERGE (union), never replace: the Mac and a browser tab can each mark things, and neither
 * may undo the other. Nothing is ever marked unread.
 */

export const NOTIFICATION_STATE_SETTING = "notifications:state";

/** What an encoded value may use; PUT /api/me/settings takes 8,000 characters, and this leaves room for the JSON around it. */
export const NOTIFICATION_STATE_BUDGET = 7_600;

/** Seen and read, as hashed keys (see notificationKey), plus the watermark. */
export type NotificationReadState = {
  seen: Set<string>;
  read: Set<string>;
  /** Every notification stamped at or before this instant (ms) counts as seen and read; null for none. */
  through: number | null;
};

/** What a notification has to offer the state: its id, and its time for the watermark. */
export type NotificationStamp = { id: string; timestamp: string };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const KEY_LENGTH = 5;

/** A notification id as 5 characters: FNV-1a over its UTF-16 units, 30 bits of it. The same on every side. */
export function notificationKey(id: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let bits = hash & 0x3fffffff;
  let out = "";
  for (let index = 0; index < KEY_LENGTH; index += 1) {
    out = ALPHABET[bits & 63] + out;
    bits >>>= 6;
  }
  return out;
}

export const emptyNotificationState = (): NotificationReadState => ({ seen: new Set(), read: new Set(), through: null });

const stampTime = (timestamp: string) => new Date(timestamp).getTime();
const covered = (state: NotificationReadState, item: NotificationStamp) => {
  if (state.through === null) return false;
  const at = stampTime(item.timestamp);
  return Number.isFinite(at) && at <= state.through;
};

export function isNotificationSeen(state: NotificationReadState, item: NotificationStamp): boolean {
  return state.seen.has(notificationKey(item.id)) || covered(state, item);
}

export function isNotificationRead(state: NotificationReadState, item: NotificationStamp): boolean {
  return state.read.has(notificationKey(item.id)) || covered(state, item);
}

/** How many of these this person has not been shown yet: the bell's badge, and the notch's count. */
export function unseenNotificationCount(state: NotificationReadState, items: NotificationStamp[]): number {
  return items.filter((item) => !isNotificationSeen(state, item)).length;
}

/** Mark notifications seen, or read (which is also seen). Returns the same object when nothing changes. */
export function markNotifications(state: NotificationReadState, ids: string[], how: "seen" | "read"): NotificationReadState {
  const keys = ids.map(notificationKey);
  const missing = keys.filter((key) => !state.seen.has(key) || (how === "read" && !state.read.has(key)));
  if (missing.length === 0) return state;
  return {
    seen: new Set([...state.seen, ...keys]),
    read: how === "read" ? new Set([...state.read, ...keys]) : state.read,
    through: state.through
  };
}

/** The union of several states: what either side marked stays marked. */
export function mergeNotificationStates(...states: NotificationReadState[]): NotificationReadState {
  const through = states.reduce<number | null>(
    (latest, state) => (state.through === null ? latest : latest === null ? state.through : Math.max(latest, state.through)),
    null
  );
  return {
    seen: new Set(states.flatMap((state) => [...state.seen])),
    read: new Set(states.flatMap((state) => [...state.read])),
    through
  };
}

/* ── the stored value ──────────────────────────────────────────────────────────────────────── */

type Stored = { v: 1; s: string; r: string; t: number | null };

function packBits(bits: boolean[]): string {
  let out = "";
  for (let index = 0; index < bits.length; index += 6) {
    let value = 0;
    for (let bit = 0; bit < 6; bit += 1) if (bits[index + bit]) value |= 1 << bit;
    out += ALPHABET[value];
  }
  return out;
}

function unpackBits(text: string, count: number): boolean[] {
  const bits: boolean[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = ALPHABET.indexOf(text[Math.floor(index / 6)] ?? "A");
    bits.push(value > 0 && (value & (1 << (index % 6))) !== 0);
  }
  return bits;
}

/** Read a stored value. Anything unreadable — nothing, a corrupt string, an old format — is simply "nothing marked yet". */
export function decodeNotificationState(value: unknown): NotificationReadState {
  if (typeof value !== "string" || !value) return emptyNotificationState();
  let parsed: Partial<Stored>;
  try {
    parsed = JSON.parse(value) as Partial<Stored>;
  } catch {
    return emptyNotificationState();
  }
  if (!parsed || parsed.v !== 1 || typeof parsed.s !== "string") return emptyNotificationState();
  const seenKeys: string[] = [];
  for (let index = 0; index + KEY_LENGTH <= parsed.s.length; index += KEY_LENGTH) seenKeys.push(parsed.s.slice(index, index + KEY_LENGTH));
  const readBits = unpackBits(typeof parsed.r === "string" ? parsed.r : "", seenKeys.length);
  return {
    seen: new Set(seenKeys),
    read: new Set(seenKeys.filter((_, index) => readBits[index])),
    through: typeof parsed.t === "number" && Number.isFinite(parsed.t) ? parsed.t : null
  };
}

function serialize(seen: string[], read: Set<string>, through: number | null): string {
  const sorted = [...seen].sort();
  const stored: Stored = { v: 1, s: sorted.join(""), r: packBits(sorted.map((key) => read.has(key))), t: through };
  return JSON.stringify(stored);
}

/**
 * Write a state as the stored value.
 *
 * Given the current list (`items`), it keeps only what is still listed and, when that is still over
 * `budget`, folds the oldest into the watermark until it fits. Without a list — or with an EMPTY one,
 * which is far more likely a list not loaded yet than a workspace with nothing in it — it keeps
 * everything, because pruning against the wrong list would forget what was marked.
 */
export function encodeNotificationState(
  state: NotificationReadState,
  items?: NotificationStamp[],
  budget = NOTIFICATION_STATE_BUDGET
): string {
  if (!items || items.length === 0) {
    return serialize([...state.seen], new Set([...state.read].filter((key) => state.seen.has(key))), state.through);
  }
  // the listed notifications this state marks explicitly, once each, oldest first
  const listed = new Set<string>();
  const marked = items
    .map((item) => ({ key: notificationKey(item.id), at: stampTime(item.timestamp) }))
    .filter((entry) => {
      if (listed.has(entry.key) || !state.seen.has(entry.key)) return false;
      listed.add(entry.key);
      return !(state.through !== null && Number.isFinite(entry.at) && entry.at <= state.through);
    })
    .sort((a, b) => (Number.isFinite(a.at) ? a.at : Infinity) - (Number.isFinite(b.at) ? b.at : Infinity));
  let through = state.through;
  let kept = marked;
  let value = serialize(
    kept.map((entry) => entry.key),
    state.read,
    through
  );
  // over budget: fold the oldest into the watermark, a slice at a time, until it fits
  while (value.length > budget && kept.length > 0) {
    const over = Math.max(1, Math.ceil((value.length - budget) / KEY_LENGTH));
    const folded = kept.slice(0, over).filter((entry) => Number.isFinite(entry.at));
    if (folded.length === 0) break;
    through = Math.max(through ?? -Infinity, ...folded.map((entry) => entry.at));
    const cutoff = through;
    kept = kept.filter((entry) => !(Number.isFinite(entry.at) && entry.at <= cutoff));
    value = serialize(
      kept.map((entry) => entry.key),
      state.read,
      through
    );
  }
  return value;
}

/**
 * What the server stores when a value arrives: the stored one and the incoming one merged, then
 * written against the server's own list. PUT /api/me/settings calls this for the one key, and the
 * Mac's route will too, so neither side can undo what the other marked.
 */
export function mergeNotificationStateValues(stored: string | undefined, incoming: string, items: NotificationStamp[]): string {
  return encodeNotificationState(mergeNotificationStates(decodeNotificationState(stored), decodeNotificationState(incoming)), items);
}
