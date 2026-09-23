/**
 * The workspace's forecast for the schedule's side panels (2026-09-23), read once and shared: a
 * job panel opened, closed and opened again — or the next job's, or a marker's — shows what the
 * last one read instead of asking again. The server keeps each site's forecast for half an hour,
 * so holding it here for five minutes costs nothing in freshness.
 *
 * A read that fails is not kept: the next panel asks again. Unavailable is said out loud by the
 * card, never shown as a week without weather.
 */
import { useCallback, useEffect, useState } from "react";
import type { WeatherForecastPayload } from "@buildflow/shared";
import { weatherForecast } from "../api";
import { readForecast } from "./weatherIQ";

const KEEP_MS = 5 * 60_000;

let kept: { at: number; forecast: WeatherForecastPayload } | null = null;
let reading: Promise<WeatherForecastPayload | null> | null = null;

const fresh = () => (kept && Date.now() - kept.at < KEEP_MS ? kept.forecast : null);

function read(force: boolean): Promise<WeatherForecastPayload | null> {
  const known = force ? null : fresh();
  if (known) return Promise.resolve(known);
  if (!force && reading) return reading;
  const request = (async () => {
    try {
      const forecast = readForecast(await weatherForecast());
      if (forecast) kept = { at: Date.now(), forecast };
      return forecast;
    } catch {
      return null;
    }
  })();
  reading = request;
  void request.finally(() => {
    if (reading === request) reading = null;
  });
  return request;
}

export type ForecastLoad = { state: "loading" } | { state: "ready"; forecast: WeatherForecastPayload } | { state: "unavailable" };

const loaded = (forecast: WeatherForecastPayload | null): ForecastLoad =>
  forecast ? { state: "ready", forecast } : { state: "unavailable" };

export function useForecast(): { load: ForecastLoad; refresh: () => Promise<void> } {
  const [load, setLoad] = useState<ForecastLoad>(() => {
    const known = fresh();
    return known ? { state: "ready", forecast: known } : { state: "loading" };
  });

  useEffect(() => {
    let alive = true;
    void read(false).then((forecast) => {
      if (alive) setLoad(loaded(forecast));
    });
    return () => {
      alive = false;
    };
  }, []);

  /** After a decision: the job days as the server now has them. */
  const refresh = useCallback(async () => {
    const forecast = await read(true);
    // a refresh that fails keeps what is on screen rather than blanking it
    setLoad((current) => (forecast ? loaded(forecast) : current));
  }, []);

  return { load, refresh };
}

/** Tests only: forget what was read, so one test's forecast is not the next one's. */
export function __forgetForecast() {
  kept = null;
  reading = null;
}
