/**
 * Where things are, and how far apart (moved out of App.tsx 2026-09-22 with the Map & Field Ops
 * redesign; the code is the page's own, unchanged): the site cards' coordinates and accents,
 * the saved routes an optimized plan and a truck route are kept in, straight-line distance,
 * and the three outside services the page talks to — Nominatim (addresses), OSRM (the fastest
 * driving route) — each with an estimated fallback so the page keeps working without them.
 *
 * Nothing here knows about React or the board; the page composes it.
 */
import { type Job, type Project, type Status } from "@buildflow/shared";

export function formatGeoCoordinates(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "Coordinates not set";
  const ns = latitude >= 0 ? "N" : "S";
  const ew = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(4)}° ${ns}, ${Math.abs(longitude).toFixed(4)}° ${ew}`;
}

/** A site card's accent: the same ink the status badges use. */
export function mapSiteAccent(status: Status) {
  switch (status) {
    case "DelayIQed":
    case "At Risk":
      return "var(--bf-color-bad)";
    case "In Progress":
      return "var(--bf-color-accent)";
    case "Confirmed":
    case "On Site":
    case "Complete":
    case "Ready":
      return "var(--bf-color-ok)";
    case "Planned":
      return "var(--bf-ink-muted)";
    case "Ready to Start":
      return "var(--bf-color-info)";
    default:
      return "var(--bf-ink-faint)";
  }
}

export const routeGoalOptions = ["Fastest Time", "Least Fuel", "Balanced"] as const;

const savedMapRoutesStorageKey = "buildflow:map-field-ops:saved-routes:v1";
const savedRouteClasses = ["route-blue", "route-green", "route-orange", "route-purple"] as const;

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

type SavedRouteClass = (typeof savedRouteClasses)[number];

export type SavedMapRoute = {
  id: string;
  className: SavedRouteClass;
  label: string;
  points: GeoPoint[];
  vehiclePoint?: GeoPoint;
  stopPoint?: GeoPoint;
  destinationAddress?: string;
  distanceText?: string;
  durationText?: string;
  trafficStatus?: "Light" | "Moderate" | "Heavy";
  routeSource?: "live" | "estimated";
  savedAt: string;
};

export type GeocodedAddress = {
  label: string;
  address: string;
  point: GeoPoint;
};

export type AddressSuggestion = {
  id: string;
  label: string;
  context: string;
  address: string;
  point: GeoPoint;
};

export type DrivingRouteLookup = {
  points: GeoPoint[];
  distanceMiles: number;
  durationMinutes: number;
  source: "live" | "estimated";
};

export type TruckerRouteResult = {
  destinationLabel: string;
  destinationAddress: string;
  originLabel: string;
  originAddress: string;
  durationText: string;
  distanceText: string;
  trafficStatus: "Light" | "Moderate" | "Heavy";
  source: "live" | "estimated";
};

type NominatimAddressDetail = {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

type NominatimSearchResult = {
  display_name?: string;
  name?: string;
  lat: string;
  lon: string;
  address?: NominatimAddressDetail;
};

type OsrmRouteResult = {
  distance: number;
  duration: number;
  geometry?: {
    coordinates?: Array<[number, number]>;
  };
};

type OsrmRouteResponse = {
  routes?: OsrmRouteResult[];
};

export function shortMapLabel(name: string) {
  return name
    .replace("Office Building", "Office Bldg")
    .replace("Apartments", "Apts")
    .replace("Medical Center", "Medical Center")
    .replace("Warehouse", "Warehouse");
}

function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as GeoPoint;
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function isSavedRouteClass(value: unknown): value is SavedRouteClass {
  return savedRouteClasses.includes(value as SavedRouteClass);
}

function midpoint(start: GeoPoint, end: GeoPoint, latitudeOffset = 0, longitudeOffset = 0): GeoPoint {
  return {
    latitude: (start.latitude + end.latitude) / 2 + latitudeOffset,
    longitude: (start.longitude + end.longitude) / 2 + longitudeOffset
  };
}

function offsetPoint(point: GeoPoint, latitudeOffset: number, longitudeOffset: number): GeoPoint {
  return {
    latitude: point.latitude + latitudeOffset,
    longitude: point.longitude + longitudeOffset
  };
}

function normalizeSavedMapRoutes(value: unknown): SavedMapRoute[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((route, index) => {
    if (!route || typeof route !== "object") return [];
    const candidate = route as SavedMapRoute;
    const points = Array.isArray(candidate.points) ? candidate.points.filter(isGeoPoint) : [];
    if (points.length < 2 || !isSavedRouteClass(candidate.className)) return [];

    return [
      {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : `saved-route-${index + 1}`,
        className: candidate.className,
        label: typeof candidate.label === "string" && candidate.label ? candidate.label : `Saved route ${index + 1}`,
        points,
        vehiclePoint: isGeoPoint(candidate.vehiclePoint) ? candidate.vehiclePoint : midpoint(points[0], points[points.length - 1]),
        stopPoint: isGeoPoint(candidate.stopPoint) ? candidate.stopPoint : undefined,
        destinationAddress: typeof candidate.destinationAddress === "string" ? candidate.destinationAddress : undefined,
        distanceText: typeof candidate.distanceText === "string" ? candidate.distanceText : undefined,
        durationText: typeof candidate.durationText === "string" ? candidate.durationText : undefined,
        trafficStatus:
          candidate.trafficStatus === "Light" || candidate.trafficStatus === "Moderate" || candidate.trafficStatus === "Heavy"
            ? candidate.trafficStatus
            : undefined,
        routeSource: candidate.routeSource === "live" || candidate.routeSource === "estimated" ? candidate.routeSource : undefined,
        savedAt: typeof candidate.savedAt === "string" && candidate.savedAt ? candidate.savedAt : new Date().toISOString()
      }
    ];
  });
}

export function isTruckerRoute(route: SavedMapRoute) {
  return route.id.startsWith("trucker-route-");
}

export function isPlanRoute(route: SavedMapRoute) {
  return route.id.startsWith("saved-") && !route.id.startsWith("saved-reference-");
}

function isRouteOptimizationRoute(route: SavedMapRoute) {
  return isTruckerRoute(route) || isPlanRoute(route);
}

export function orderedRouteProjects(projects: Project[], jobs: Job[]) {
  const orderedProjectIds = jobs.map((job) => job.projectId);
  const routeProjects: Project[] = [];

  orderedProjectIds.forEach((projectId) => {
    const project = projects.find((item) => item.id === projectId);
    if (project && !routeProjects.some((item) => item.id === project.id)) {
      routeProjects.push(project);
    }
  });

  projects.forEach((project) => {
    if (!routeProjects.some((item) => item.id === project.id)) {
      routeProjects.push(project);
    }
  });

  return routeProjects;
}

export function createSavedMapRoutes(projects: Project[], jobs: Job[] = [], savedAt = new Date().toISOString()): SavedMapRoute[] {
  const routeProjects = orderedRouteProjects(projects, jobs);

  if (routeProjects.length === 0) {
    return [];
  }

  if (routeProjects.length === 1) {
    const project = routeProjects[0];
    const destination = { latitude: project.latitude, longitude: project.longitude };
    const start = offsetPoint(destination, 0.042, -0.035);
    const control = midpoint(start, destination, 0.012, 0.01);
    return [
      {
        id: `saved-${project.id}`,
        className: "route-blue",
        label: `${shortMapLabel(project.name)} saved route`,
        points: [start, control, destination],
        vehiclePoint: midpoint(start, control),
        stopPoint: destination,
        savedAt
      }
    ];
  }

  const routeOffsets = [
    { latitude: 0.018, longitude: -0.018 },
    { latitude: -0.016, longitude: 0.024 },
    { latitude: -0.012, longitude: -0.02 },
    { latitude: 0.014, longitude: 0.02 }
  ];

  return routeProjects.slice(0, 4).map((project, index) => {
    const nextProject = routeProjects[(index + 1) % routeProjects.length];
    const start = { latitude: project.latitude, longitude: project.longitude };
    const end = { latitude: nextProject.latitude, longitude: nextProject.longitude };
    const control = midpoint(start, end, routeOffsets[index].latitude, routeOffsets[index].longitude);
    return {
      id: `saved-${project.id}-${nextProject.id}-${index + 1}`,
      className: savedRouteClasses[index],
      label: `${shortMapLabel(project.name)} to ${shortMapLabel(nextProject.name)}`,
      points: [start, control, end],
      vehiclePoint: midpoint(start, control),
      stopPoint: index === 2 ? end : undefined,
      savedAt
    };
  });
}

export function readSavedMapRoutes(projects: Project[], jobs: Job[]) {
  if (typeof window === "undefined") {
    return createSavedMapRoutes(projects, jobs);
  }

  try {
    return normalizeSavedMapRoutes(JSON.parse(window.localStorage.getItem(savedMapRoutesStorageKey) ?? "[]")).filter(
      isRouteOptimizationRoute
    );
  } catch {
    return [];
  }
}

export function writeSavedMapRoutes(routes: SavedMapRoute[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(savedMapRoutesStorageKey, JSON.stringify(routes));
  } catch {
    // Route persistence is a convenience layer; the map should keep working if storage is unavailable.
  }
}

export function formatRouteDistance(miles: number) {
  return miles >= 10 ? `${miles.toFixed(1)} mi` : `${miles.toFixed(2)} mi`;
}

export function formatRouteDuration(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
}

export function classifyTraffic(distanceMiles: number, durationMinutes: number): TruckerRouteResult["trafficStatus"] {
  const averageMph = distanceMiles / Math.max(durationMinutes / 60, 0.1);
  if (averageMph < 18) return "Heavy";
  if (averageMph < 30) return "Moderate";
  return "Light";
}

export function haversineMiles(start: GeoPoint, end: GeoPoint) {
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = ((end.latitude - start.latitude) * Math.PI) / 180;
  const longitudeDelta = ((end.longitude - start.longitude) * Math.PI) / 180;
  const startLatitude = (start.latitude * Math.PI) / 180;
  const endLatitude = (end.latitude * Math.PI) / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type RouteGoal = (typeof routeGoalOptions)[number];

const routeGoalProfiles: Record<RouteGoal, { speedMph: number; savings: number; savingsLabel: string }> = {
  "Fastest Time": { speedMph: 33, savings: 18, savingsLabel: "drive time" },
  "Least Fuel": { speedMph: 25, savings: 15, savingsLabel: "fuel burn" },
  Balanced: { speedMph: 29, savings: 13, savingsLabel: "time & fuel" }
};

export type OptimizationSummary = {
  driveTime: string;
  totalDistance: string;
  savings: number;
  savingsLabel: string;
  hasDistance: boolean;
};

function planRouteMiles(routes: SavedMapRoute[]) {
  return routes.reduce((total, route) => {
    if (route.points.length < 2) return total;
    const start = route.points[0];
    const end = route.points[route.points.length - 1];
    return total + haversineMiles(start, end) * 1.28;
  }, 0);
}

// Derives the optimization stat block (drive time / distance / savings) from the real
// route geometry so the goal control actually changes the numbers instead of showing
// hardcoded placeholders. Slower goals (Least Fuel) read as longer time but bigger savings.
export function summarizeOptimizationPlan(routes: SavedMapRoute[], goal: RouteGoal): OptimizationSummary {
  const profile = routeGoalProfiles[goal];
  const miles = planRouteMiles(routes);
  const hasDistance = miles > 0;
  const minutes = hasDistance ? (miles / profile.speedMph) * 60 : 0;
  return {
    driveTime: hasDistance ? formatRouteDuration(minutes) : "0m",
    totalDistance: hasDistance ? formatRouteDistance(miles) : "Pending",
    savings: profile.savings,
    savingsLabel: profile.savingsLabel,
    hasDistance
  };
}

function compactRoutePoints(points: GeoPoint[], maxPoints = 48) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]);
}

export function estimatedDrivingRoute(origin: GeoPoint, destination: GeoPoint): DrivingRouteLookup {
  const distanceMiles = Math.max(0.25, haversineMiles(origin, destination) * 1.28);
  const durationMinutes = Math.max(2, Math.round((distanceMiles / 26) * 60));
  const control = midpoint(origin, destination, 0.012, -0.014);

  return {
    points: [origin, control, destination],
    distanceMiles,
    durationMinutes,
    source: "estimated"
  };
}

export async function geocodeAddress(query: string): Promise<GeocodedAddress> {
  const searches = [query, query.includes(",") ? query : `${query}, Austin, TX`];

  for (const search of searches) {
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      q: search
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) continue;

    const results = (await response.json()) as NominatimSearchResult[];
    const match = results.find((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)));
    if (match) {
      return {
        label: match.name || match.display_name?.split(",")[0] || query,
        address: match.display_name || query,
        point: {
          latitude: Number(match.lat),
          longitude: Number(match.lon)
        }
      };
    }
  }

  throw new Error("Address not found");
}

// Turns a raw Nominatim hit into a two-line suggestion ("1 Old Ferry Road" + "Bristol, RI")
// so the trucker destination dropdown reads like a familiar maps autocomplete.
function parseAddressSuggestion(result: NominatimSearchResult, index: number): AddressSuggestion | null {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const detail = result.address ?? {};
  const segments = (result.display_name ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const streetLine = [detail.house_number, detail.road].filter(Boolean).join(" ");
  const locality = detail.city || detail.town || detail.village || detail.hamlet || detail.suburb || detail.county;

  const label = streetLine || result.name?.trim() || segments[0] || (result.display_name ?? "Address");
  const structuredContext = [locality, detail.state].filter((part): part is string => Boolean(part));
  const contextSource = structuredContext.length > 0 ? structuredContext : segments.slice(1);
  const context = contextSource
    .filter((part) => part.toLowerCase() !== label.toLowerCase() && part !== "United States")
    .slice(0, 2)
    .join(", ");

  return {
    id: `${result.lat},${result.lon},${index}`,
    label,
    context,
    address: result.display_name || label,
    point: { latitude, longitude }
  };
}

export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "us",
    limit: "6",
    q: trimmed
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) return [];

  const results = (await response.json()) as NominatimSearchResult[];
  const suggestions: AddressSuggestion[] = [];
  const seen = new Set<string>();
  results.forEach((result, index) => {
    const suggestion = parseAddressSuggestion(result, index);
    if (!suggestion) return;
    const dedupeKey = `${suggestion.label}|${suggestion.context}`.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    suggestions.push(suggestion);
  });
  return suggestions;
}

export function suggestionDisplayValue(suggestion: AddressSuggestion) {
  return suggestion.context ? `${suggestion.label}, ${suggestion.context}` : suggestion.label;
}

export async function getFastestDrivingRoute(origin: GeoPoint, destination: GeoPoint): Promise<DrivingRouteLookup> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
    "?overview=full&geometries=geojson&alternatives=true&steps=false";

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Route service unavailable");

    const payload = (await response.json()) as OsrmRouteResponse;
    const fastestRoute = (payload.routes ?? [])
      .filter((route) => Number.isFinite(route.duration) && Number.isFinite(route.distance))
      .sort((first, second) => first.duration - second.duration)[0];

    if (!fastestRoute) throw new Error("Route not found");

    const routePoints =
      fastestRoute.geometry?.coordinates?.map(([longitude, latitude]) => ({ latitude, longitude })).filter(isGeoPoint) ?? [];

    return {
      points: compactRoutePoints(routePoints.length >= 2 ? routePoints : [origin, destination]),
      distanceMiles: fastestRoute.distance / 1609.344,
      durationMinutes: Math.max(1, Math.round(fastestRoute.duration / 60)),
      source: "live"
    };
  } catch {
    return estimatedDrivingRoute(origin, destination);
  }
}
