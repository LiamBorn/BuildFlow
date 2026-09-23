/**
 * WeatherIQ's icons: one for each sky a forecast day can have, and one for each cause of a
 * window. Shared by the Dashboard's section and the WeatherIQ card in the schedule's side panels,
 * so a storm looks like the same storm in both.
 */
import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  ThermometerSnowflake,
  ThermometerSun,
  Wind
} from "lucide-react";
import type { WeatherCause } from "@buildflow/shared";
import type { ConditionKind } from "./weatherIQ";

export const CONDITION_ICON: Record<ConditionKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning
};

export const CAUSE_ICON: Record<WeatherCause, LucideIcon> = {
  lightning: CloudLightning,
  rain: CloudRain,
  snow: CloudSnow,
  wind: Wind,
  heat: ThermometerSun,
  cold: ThermometerSnowflake,
  fog: CloudFog
};
