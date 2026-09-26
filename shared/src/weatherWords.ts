/**
 * How WeatherIQ names weather where a person reads it. Moved here from client/src/weather/weatherIQ.ts
 * (2026-09-26, notch step 3) because the notification list is now built on the server too, for the
 * Mac, and a notification's words must be the same wherever it is read. The client re-exports these
 * under their old names, so nothing that imported them there changed.
 */
import type { WeatherCause } from "./index";

/** How each cause is named where a person reads it. */
export const WEATHER_CAUSE_LABEL: Record<WeatherCause, string> = {
  lightning: "Lightning",
  rain: "Rain",
  snow: "Snow",
  wind: "Wind",
  heat: "Heat",
  cold: "Freeze",
  fog: "Fog"
};

/** A site-local "YYYY-MM-DDTHH:mm" as the hour and its half of the day: { text: "1" | "3:30", meridiem: "PM" }. */
function clockParts(time: string) {
  const [hours, minutes] = (time.split("T")[1] ?? "00:00").split(":").map(Number);
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return { text: minutes ? `${twelve}:${String(minutes).padStart(2, "0")}` : String(twelve), meridiem: hours < 12 ? "AM" : "PM" };
}

/** "1 PM", "3:30 PM". */
export function weatherClockWords(time: string): string {
  const parts = clockParts(time);
  return `${parts.text} ${parts.meridiem}`;
}

/** "1–3 PM", "11 AM–1 PM": when a stretch of weather runs, the way a person says it. */
export function weatherTimeRange(start: string, end: string): string {
  const from = clockParts(start);
  const to = clockParts(end);
  return from.meridiem === to.meridiem
    ? `${from.text}–${to.text} ${to.meridiem}`
    : `${from.text} ${from.meridiem}–${to.text} ${to.meridiem}`;
}

/** "Wednesday": the day a site-local date falls on, read at noon so no time zone can move it. */
export function weekdayName(date: string, style: "long" | "short" = "long"): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: style });
}
