/**
 * Where WeatherIQ reads a project's forecast (2026-09-23) — asked for as "the Workspace & Admin can
 * change the locations of WeatherIQ depending on the Project". The program's editing drawer (`.pdx`),
 * like every other edit.
 *
 * A project's forecast is read at its own map point, or — because every project made in the app is
 * stored at a placeholder point — at the town its address names. When that is the wrong place (a
 * yard address, a site across the county line, no ZIP code), an Owner or Admin types the right one:
 * an address, a ZIP code or a town. The server looks it up and keeps it for WeatherIQ alone; only the
 * ZIP code or the town ever leaves BuildFlow.
 */
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import type { Project, SiteWeatherForecast } from "@buildflow/shared";
import { clearWeatherLocation, setWeatherLocation } from "../api";
import { useModalDialog } from "../schedule/hooks";

const HOW: Record<SiteWeatherForecast["locatedBy"], string> = {
  custom: "Set for WeatherIQ",
  address: "Found from the project's address",
  project: "The project's own map point"
};

export function WeatherLocationDrawer({
  project,
  site,
  onClose,
  onSaved
}: {
  project: Project;
  /** The site as the forecast last found it; null when it could not be found. */
  site: SiteWeatherForecast | null;
  onClose: () => void;
  /** Read the forecast again, at the new place. */
  onSaved: () => Promise<void>;
}) {
  const panelRef = useModalDialog<HTMLElement>(onClose);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "reset">("");
  const [error, setError] = useState("");
  const canSave = query.trim().length >= 2 && !busy;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy("save");
    setError("");
    try {
      await setWeatherLocation(project.id, query.trim());
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The location could not be saved.");
      setBusy("");
    }
  }

  async function useAddress() {
    if (busy) return;
    setBusy("reset");
    setError("");
    try {
      await clearWeatherLocation(project.id);
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The location could not be reset.");
      setBusy("");
    }
  }

  return createPortal(
    <div className="project-dialog-backdrop pdx" role="presentation">
      <section
        className="project-dialog pdx-dialog wiq-location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiq-location-title"
        aria-describedby="wiq-location-description"
        ref={panelRef}
      >
        <div className="pdx-glow" aria-hidden="true">
          <span className="pdx-aurora pdx-aurora-1" />
          <span className="pdx-aurora pdx-aurora-2" />
        </div>
        <header className="project-dialog-header pdx-head">
          <div>
            <span className="pdx-eyebrow">
              <span className="pdx-dot" />
              WeatherIQ
            </span>
            <h2 id="wiq-location-title" className="pdx-title">
              Forecast <em>location</em>
            </h2>
            <p className="pdx-sub" id="wiq-location-description">
              {project.name}
            </p>
          </div>
          <button className="pdx-close" aria-label="Close Forecast location" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form className="project-form pdx-form wiq-location-form" onSubmit={save}>
          <div className="project-form-wide wiq-location-now">
            <MapPin size={18} aria-hidden="true" />
            <span>
              <strong>{site?.place || "Not found yet"}</strong>
              <em>{site ? HOW[site.locatedBy] : "BuildFlow could not find this site from its address."}</em>
            </span>
          </div>
          <label className="project-form-wide">
            <span>Address, ZIP code or town</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={project.address || "Example: 78701, or Round Rock, TX"}
            />
          </label>
          <p className="wiq-location-hint project-form-wide">
            WeatherIQ reads the forecast for the town it finds. Only the ZIP code or the town leaves BuildFlow, never a street address.
          </p>
          {error && (
            <p className="form-error project-form-wide" role="alert">
              {error}
            </p>
          )}
          <div className="project-dialog-actions pdx-actions project-form-wide">
            {site?.locatedBy === "custom" && (
              <button className="pdx-cancel wiq-location-reset" type="button" disabled={Boolean(busy)} onClick={useAddress}>
                {busy === "reset" ? "Resetting" : "Use the project's address"}
              </button>
            )}
            <button className="pdx-cancel" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="pdx-save" disabled={!canSave} type="submit">
              {busy === "save" ? "Finding it" : "Save location"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
