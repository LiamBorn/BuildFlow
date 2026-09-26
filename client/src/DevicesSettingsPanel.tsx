/**
 * Settings › Devices: the Macs connected through BuildFlow for Mac, and a way to take one back.
 *
 * Per person, like the rest of the Account group: it lists the signed-in login's own Macs, and
 * revoking is limited to those on the server as well (DELETE /api/me/devices/:id answers 404 for
 * anyone else's). A revoked Mac's key stops working on its very next request.
 *
 * Revoking is two steps, the same inline confirm the Team panel uses for its destructive controls:
 * no dialog to dismiss by a stray click, and the first button keeps its accessible name.
 */
import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import type { DesktopDevice } from "@buildflow/shared";
import { fetchMyDevices, revokeMyDevice } from "./api";
import { formatDate } from "./formatDate";

const HOUR = 60 * 60 * 1000;

/**
 * "Last seen", in words. The server writes it at most once an hour, so a Mac in use right now can
 * read up to an hour old; anything inside two hours is therefore "active recently", not a time.
 */
export function lastSeenLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Not seen yet";
  const elapsed = now - new Date(iso).getTime();
  if (elapsed < 2 * HOUR) return "Active recently";
  const hours = Math.floor(elapsed / HOUR);
  if (hours < 24) return `Last seen ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last seen ${days} day${days === 1 ? "" : "s"} ago`;
  return `Last seen ${formatDate(iso)}`;
}

function detailLine(device: DesktopDevice) {
  const app = [device.appVersion ? `BuildFlow for Mac ${device.appVersion}` : "", device.platform ?? ""].filter(Boolean).join(" · ");
  return [device.workspace.name, `Connected ${formatDate(device.createdAt)}`, app].filter(Boolean).join(" · ");
}

export function DevicesSettingsPanel() {
  const [devices, setDevices] = useState<DesktopDevice[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** The one device awaiting confirmation, so only ever one Revoke is armed. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMyDevices()
      .then((payload) => {
        if (live) setDevices(Array.isArray(payload?.devices) ? payload.devices : []);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setDevices([]);
        setError(err instanceof Error ? err.message : "Could not load your devices.");
      });
    return () => {
      live = false;
    };
  }, []);

  const revoke = async (device: DesktopDevice) => {
    setConfirmingId(null);
    setBusyId(device.id);
    setError("");
    setNotice("");
    try {
      await revokeMyDevice(device.id);
      setDevices((current) => (current ?? []).filter((one) => one.id !== device.id));
      setNotice(`${device.name} is disconnected. It will ask to connect again the next time it opens.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect that Mac.");
    } finally {
      setBusyId(null);
    }
  };

  const count = devices?.length ?? 0;

  return (
    <section className="settings-team-section" aria-labelledby="settings-devices-title">
      <div className="settings-team-heading">
        <div>
          <span className="settings-team-kicker">
            <Laptop size={18} />
            BuildFlow for Mac
          </span>
          <h2 id="settings-devices-title">Connected Macs</h2>
          <p>Each Mac signs in as you, in the workspace you connected it from. Revoke one and it is signed out at once.</p>
        </div>
        {devices && <span className="settings-owner-summary">{count} connected</span>}
      </div>

      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="acct-success" role="status">
          {notice}
        </p>
      )}

      <div className="settings-member-list" aria-busy={devices === null}>
        {devices === null ? (
          <p className="settings-devices-empty">Loading your devices…</p>
        ) : devices.length === 0 ? (
          <p className="settings-devices-empty">No Macs are connected. When you connect BuildFlow for Mac, it shows up here.</p>
        ) : (
          devices.map((device) => (
            <article className="settings-member-row" key={device.id} aria-label={device.name}>
              <div className="settings-member-identity">
                <span className="settings-member-avatar" aria-hidden="true">
                  <Laptop size={19} />
                </span>
                <div>
                  <strong>{device.name}</strong>
                  <p>{detailLine(device)}</p>
                  <p>{lastSeenLabel(device.lastSeenAt)}</p>
                </div>
              </div>
              <div className="settings-member-controls">
                {confirmingId === device.id ? (
                  <span className="settings-member-confirm" role="group" aria-label={`Confirm revoking ${device.name}`}>
                    <button
                      className="settings-member-remove is-confirming"
                      type="button"
                      aria-label={`Confirm: revoke ${device.name}`}
                      onClick={() => void revoke(device)}
                    >
                      Revoke
                    </button>
                    <button
                      className="settings-member-cancel"
                      type="button"
                      aria-label={`Keep ${device.name}`}
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="acct-link-btn"
                    aria-label={`Revoke ${device.name}`}
                    disabled={busyId === device.id}
                    onClick={() => setConfirmingId(device.id)}
                  >
                    {busyId === device.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
