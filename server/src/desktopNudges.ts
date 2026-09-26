/* =========================================================================
   BuildFlow for Mac, step 5: the live nudges behind GET /api/desktop/events.
   The route is in desktopInboxRoutes.ts; this is the hub it opens streams on.
   ========================================================================= */
import type express from "express";
import type { BuildFlowStore, DesktopDeviceRow } from "./database.js";
import { belongsTo, isDemoIdentity } from "./desktop.js";
import type { StoreManager } from "./stores.js";
import { SseHub } from "./sseHub.js";

type Listener = { deviceId: string; accountId: string };

/** How long a burst of writes is waited out before its one nudge, and the longest a nudge is held. */
export const NUDGE_QUIET_MS = 250;
export const NUDGE_MAX_WAIT_MS = 1000;
/** How soon after the control database changes the open streams' devices are checked again. */
const RECHECK_MS = 100;

const INBOX_FRAME = `event: inbox\ndata: ${JSON.stringify({ etag: null })}\n\n`;
const REVOKED_FRAME = `event: revoked\ndata: ${JSON.stringify({ code: "device_revoked" })}\n\n`;

/**
 * The Mac's live nudges, one stream per connected Mac, grouped by workspace.
 *
 * WHAT A NUDGE SAYS: "something your inbox shows may have changed" -- `event: inbox`, with no etag,
 * because the inbox is per person and working one out for every listener on every write would cost
 * a whole read each. The Mac re-reads /inbox, which answers 304 when nothing it shows did change.
 *
 * WHEN. After any write to the workspace's file (StoreManager.onOrgSaved): schedule changes, and the
 * writes that told nobody before -- field updates, DelayIQ, materials, equipment, variances, weather
 * conflicts (including the ones WeatherIQ finds while reading a forecast), time entries and read
 * state. A burst is one nudge: NUDGE_QUIET_MS after the last write, and never later than
 * NUDGE_MAX_WAIT_MS after the first. A calendar connected or disconnected is a write to the control
 * database, so that person is told directly (`nudgeAccount`).
 *
 * NEVER ACROSS WORKSPACES. The group is the device's own workspace, bound by the gate when the stream
 * opened; a write is heard only by the group of the store that made it.
 *
 * REVOKED MEANS CLOSED. A stream is checked against the control database whenever that database
 * changes (a revoke, a teammate removed, a workspace deleted) and before every ping; a device that
 * no longer holds is sent `event: revoked` and the stream ends.
 */
export class DesktopNudges {
  private readonly hub: SseHub<Listener>;
  private readonly pending = new Map<string, { timer: ReturnType<typeof setTimeout>; firstAt: number }>();
  private recheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly mainStore: BuildFlowStore,
    manager: Pick<StoreManager, "onOrgSaved">,
    private readonly timing = { quietMs: NUDGE_QUIET_MS, maxWaitMs: NUDGE_MAX_WAIT_MS, heartbeatMs: 25_000 }
  ) {
    this.hub = new SseHub<Listener>(timing.heartbeatMs);
    manager.onOrgSaved((orgId) => this.nudge(orgId));
    mainStore.onSaved(() => this.scheduleRecheck());
  }

  /** Opens a device's stream on its workspace. The first frame is a nudge: whatever changed while it was away. */
  open(orgId: string, res: express.Response, device: DesktopDeviceRow) {
    this.hub.open(
      orgId,
      res,
      { deviceId: device.id, accountId: device.accountId },
      {
        retryMs: 5000,
        hello: INBOX_FRAME,
        beforeHeartbeat: (listener) => {
          if (this.stillConnected(listener.deviceId)) return true;
          this.revoke(listener.deviceId);
          return false;
        }
      }
    );
  }

  /** A write in this workspace: its Macs hear about it once the burst is over. Free when nobody listens. */
  nudge(orgId: string) {
    if (this.hub.size(orgId) === 0) return;
    const now = Date.now();
    const waiting = this.pending.get(orgId);
    const firstAt = waiting?.firstAt ?? now;
    if (waiting) clearTimeout(waiting.timer);
    const wait = Math.max(0, Math.min(this.timing.quietMs, firstAt + this.timing.maxWaitMs - now));
    const timer = setTimeout(() => {
      this.pending.delete(orgId);
      this.hub.broadcast(orgId, INBOX_FRAME);
    }, wait);
    timer.unref?.();
    this.pending.set(orgId, { timer, firstAt });
  }

  /** Something about one person changed outside their workspace's file (a calendar connection): tell their Macs now. */
  nudgeAccount(accountId: string) {
    for (const group of new Set(this.hub.entries().map((entry) => entry.group))) {
      this.hub.broadcast(group, INBOX_FRAME, (listener) => listener.accountId === accountId);
    }
  }

  /** Tells a device it was disconnected, and ends its streams. Answers how many ended. */
  revoke(deviceId: string): number {
    return this.hub.end((listener) => listener.deviceId === deviceId, REVOKED_FRAME);
  }

  /** How many Macs of a workspace are listening. */
  size(orgId: string): number {
    return this.hub.size(orgId);
  }

  /** Ends every stream (shutdown, tests). */
  closeAll() {
    for (const waiting of this.pending.values()) clearTimeout(waiting.timer);
    this.pending.clear();
    if (this.recheckTimer) clearTimeout(this.recheckTimer);
    this.hub.closeAll();
  }

  /** Whether a device still opens its workspace: the device gate's own rules, without the key. */
  private stillConnected(deviceId: string): boolean {
    const device = this.mainStore.desktopDevice(deviceId);
    if (!device || device.revokedAt) return false;
    const account = this.mainStore.getAccountById(device.accountId);
    const org = this.mainStore.getOrg(device.orgId);
    return Boolean(account && org && !isDemoIdentity(account, org) && belongsTo(this.mainStore, account, org.id));
  }

  private scheduleRecheck() {
    if (this.recheckTimer || this.hub.entries().length === 0) return;
    this.recheckTimer = setTimeout(() => {
      this.recheckTimer = null;
      for (const { meta } of this.hub.entries()) if (!this.stillConnected(meta.deviceId)) this.revoke(meta.deviceId);
    }, RECHECK_MS);
    this.recheckTimer.unref?.();
  }
}
