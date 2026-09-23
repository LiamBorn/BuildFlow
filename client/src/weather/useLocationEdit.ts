/**
 * Saving where WeatherIQ reads a project's forecast, from wherever it is edited: the Dashboard's
 * location drawer, and the WeatherIQ card in the schedule's side panels (2026-09-23, asked for with
 * the card's place highlighted: "make it so that users can edit the location … If the users change
 * the location of the weather have it show on all other jobs & projects linked").
 *
 * The location belongs to the PROJECT (weather_locations, one row per project), so a change made
 * from one job's panel is the forecast every job, milestone and Dashboard row of that project reads
 * next. `onSaved` re-reads the forecast (and the page's data), which is what carries it to them.
 */
import { useState } from "react";
import { clearWeatherLocation, setWeatherLocation } from "../api";

export function useLocationEdit(
  projectId: string,
  /** Read the forecast again, at the new place. */
  onSaved: () => Promise<void>,
  /** The edit is over: close the drawer, or fold the card's editor away. */
  onDone: () => void
) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "reset">("");
  const [error, setError] = useState("");
  const canSave = query.trim().length >= 2 && !busy;

  async function run(kind: "save" | "reset", work: () => Promise<unknown>, failed: string) {
    setBusy(kind);
    setError("");
    try {
      await work();
      await onSaved();
      setBusy("");
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : failed);
      setBusy("");
    }
  }

  return {
    query,
    setQuery,
    busy,
    error,
    canSave,
    /** Look the place up and keep it for WeatherIQ. The server says when nothing matches. */
    save: () =>
      canSave ? run("save", () => setWeatherLocation(projectId, query.trim()), "The location could not be saved.") : Promise.resolve(),
    /** Back to the project's own address. */
    resetToAddress: () =>
      busy ? Promise.resolve() : run("reset", () => clearWeatherLocation(projectId), "The location could not be reset.")
  };
}
