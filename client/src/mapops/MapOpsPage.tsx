/**
 * Map & Field Ops (2026-09-22) — every site and every machine on one map, what the weather is
 * about to do to the schedule, and where a machine is going when you pick it.
 *
 * ON THE SAME BOARD AS THE SCHEDULE PAGES. The page hosts the Dashboard's panel board the way
 * the seven Schedule pages do (`dash-rx hs-home sched-board-host` inside a `sched-rx` root), so
 * it takes their design, their opening — the title sharpening, the control row arriving on the
 * schedule's own delays, the sections coming into focus in reading order — Customize, the "+"
 * drawer and Reset layout, without a line of motion or chrome written here. The map is a
 * section like any other; it is just the biggest one.
 *
 * WHAT IS REAL. A machine's place is the site it is assigned to; its next move is the earliest
 * job elsewhere that asks for its kind and has none (fleet.ts). The weather is Open-Meteo's
 * forecast at each site's own coordinates, or — when that cannot be reached — the workspace's
 * weather alerts, and the band says which (forecast.ts). Drive times are estimates until a
 * machine is selected, when the live road route replaces them. Three things the old page showed
 * were invented and are gone: a weather card with a fixed temperature, "travel time" minutes that
 * were a list of four numbers, and a field-update composer whose Save saved nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CloudSun,
  ExternalLink,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Plus,
  RefreshCcw,
  Route,
  Search,
  Sparkles,
  TriangleAlert,
  Truck,
  X
} from "lucide-react";
import type { BootstrapPayload, FieldUpdate, Job, Project, WeatherAlert } from "@buildflow/shared";
import { BoardCustomizeHint, BoardLayoutControls, DashBoard, HiddenPanelChips, usePersistentLayout, type DashPanel } from "../board/panelBoard";
import { AnimatedFigure } from "../components/ui/animated-figure";
import { LocationMap } from "../components/ui/expand-map";
import { DASH_COLS, compact, type GridItem, type GridLimits } from "../dashGrid";
import { TextReveal } from "../motion";
import { statusTone } from "../schedule/scheduleUtils";
import { SectionPicker, type SectionOption } from "../SectionPicker";
import { useHudMotion } from "../useHudMotion";
import { FLEET_STATE_LABEL, aKind, attentionOrder, buildFleet, describeLead, jobStart, riskOf, type FleetState, type Machine, type Move } from "./fleet";
import { CAUSE_LABEL, columnLabel, fetchSiteForecasts, forecastsFromAlerts, readForecast, type ForecastSource, type SiteForecast, type WeatherRisk } from "./forecast";
import {
  classifyTraffic,
  createSavedMapRoutes,
  formatGeoCoordinates,
  formatRouteDistance,
  formatRouteDuration,
  geocodeAddress,
  getFastestDrivingRoute,
  isPlanRoute,
  isTruckerRoute,
  mapSiteAccent,
  orderedRouteProjects,
  readSavedMapRoutes,
  routeGoalOptions,
  searchAddressSuggestions,
  shortMapLabel,
  suggestionDisplayValue,
  summarizeOptimizationPlan,
  writeSavedMapRoutes,
  type AddressSuggestion,
  type GeoPoint,
  type GeocodedAddress,
  type RouteGoal,
  type SavedMapRoute,
  type TruckerRouteResult
} from "./geo";
import { LiveMap, type MapSite } from "./LiveMap";

export type MapOpsPageProps = {
  data: BootstrapPayload;
  /** Open another page of the program (the Equipment index, Field updates, the Schedule). */
  onOpenPage: (page: "equipment" | "field" | "schedule" | "projects") => void;
  /** Open a page with one record under the reader's eye — the Equipment row for a machine. */
  onOpenRecord: (page: "equipment", id: string) => void;
  /** The trade's own weather rule, shown under the forecast as the explanation. */
  tradeWeather: { title: string; rule: string } | null;
  reload?: () => Promise<void>;
};

/** A section on the board: the Schedule pages' shape, so the picker and the panels read the same. */
type MapSection = {
  id: string;
  title: string;
  icon?: DashPanel["icon"];
  group: string;
  blurb: string;
  action?: ReactNode;
  body: ReactNode;
  /** Its place on a fresh board. */
  w: number;
  h: number;
};

const FLEET_STATES: FleetState[] = ["on-site", "moving", "down", "yard"];

const sectionLimits = (id: string): GridLimits => ({ minW: id === "map" ? 3 : 2, minH: id === "map" ? 5 : 2, maxW: DASH_COLS });

/** A fresh board: the map first and widest, the forecast under it, then pairs. */
const defaultLayout = (sections: MapSection[]): GridItem[] => {
  const items: GridItem[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const section of sections) {
    if (x + section.w > DASH_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    items.push({ id: section.id, x, y, w: section.w, h: section.h });
    x += section.w;
    rowH = Math.max(rowH, section.h);
    if (x >= DASH_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
  }
  return items;
};

const formatClock = (date: Date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const formatWhen = (date: Date) => `${date.toLocaleDateString("en-US", { weekday: "short" })} ${formatClock(date)}`;
const formatTime = (value: string) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));

const RISK_LABEL: Record<Move["risk"], string> = { "on-time": "On time", tight: "Tight", late: "Late" };

/** The machine's route with the live road time in place of the estimate, once it has arrived. */
function withLiveRoute(machine: Machine, live: LiveRoute | null): Move | null {
  if (!machine.move) return null;
  if (!live || live.machineId !== machine.equipment.id) return machine.move;
  const slackMinutes = machine.move.slackMinutes + machine.move.etaMinutes - live.minutes;
  return { ...machine.move, etaMinutes: live.minutes, distanceMiles: live.miles, slackMinutes, risk: riskOf(slackMinutes) };
}

type LiveRoute = { machineId: string; points: GeoPoint[]; minutes: number; miles: number; source: "live" | "estimated" };

/** A place someone asked ForecastIQ to watch that is not a site: a supplier, a yard, a home. */
type WatchPoint = { id: string; name: string; latitude: number; longitude: number };

export function MapOpsPage({ data, onOpenPage, onOpenRecord, tradeWeather, reload }: MapOpsPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);

  /* Time is read once a minute, not once a render: the fleet and the forecast key off it, and a
     render for a keystroke must not rebuild both. */
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const timer = window.setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const now = useMemo(() => new Date(minute * 60000), [minute]);

  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<Set<FleetState>>(() => new Set());
  const [showWeather, setShowWeather] = useState(true);
  const [showTraffic, setShowTraffic] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [liveRoute, setLiveRoute] = useState<LiveRoute | null>(null);
  const [lastSynced, setLastSynced] = useState<Date>(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  /* ---- the fleet ------------------------------------------------------------------------ */
  const fleet = useMemo(() => buildFleet(data, now), [data, now]);
  const machinesById = useMemo(() => new Map(fleet.machines.map((machine) => [machine.equipment.id, machine])), [fleet]);
  const selected = selectedMachineId ? (machinesById.get(selectedMachineId) ?? null) : null;
  const selectedMove = selected ? withLiveRoute(selected, liveRoute) : null;

  /* The live road route for the selected machine's move. OSRM answers or the estimate stands in;
     either way the card says which. */
  useEffect(() => {
    if (!selected?.move || !selected.site) {
      setLiveRoute(null);
      return;
    }
    let cancelled = false;
    const { site, move, equipment } = selected;
    getFastestDrivingRoute(site, move.to).then((lookup) => {
      if (cancelled) return;
      setLiveRoute({ machineId: equipment.id, points: lookup.points, minutes: lookup.durationMinutes, miles: lookup.distanceMiles, source: lookup.source });
    });
    return () => {
      cancelled = true;
    };
    // the move's endpoints are what matter; a re-read of the same fleet does not refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.equipment.id, selected?.site?.id, selected?.move?.to.id]);

  /* ---- the weather ---------------------------------------------------------------------- */
  const [watchPoints, setWatchPoints] = useState<WatchPoint[]>([]);
  const [forecasts, setForecasts] = useState<SiteForecast[]>([]);
  const [forecastSource, setForecastSource] = useState<ForecastSource>("none");
  const [forecastNonce, setForecastNonce] = useState(0);
  const weatherSites: Project[] = useMemo(
    () => [
      ...data.projects,
      ...watchPoints.map((point) => ({ ...data.projects[0], id: point.id, name: point.name, address: point.name, latitude: point.latitude, longitude: point.longitude }))
    ],
    [data.projects, watchPoints]
  );
  useEffect(() => {
    if (weatherSites.length === 0) {
      setForecasts([]);
      setForecastSource("none");
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    fetchSiteForecasts(weatherSites, now, controller.signal)
      .then((result) => {
        if (cancelled) return;
        setForecasts(result);
        setForecastSource("forecast");
      })
      .catch(() => {
        if (cancelled) return;
        // the workspace's own alerts, and the band says so
        setForecasts(forecastsFromAlerts(weatherSites, data.weatherAlerts as WeatherAlert[], now));
        setForecastSource(data.weatherAlerts.length > 0 ? "alerts" : "none");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // refetched on demand (Refresh) and when the sites change, not every minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherSites, data.weatherAlerts, forecastNonce]);
  const forecast = useMemo(() => readForecast(weatherSites, forecasts, data.jobs, now), [weatherSites, forecasts, data.jobs, now]);
  const weatherAt = useMemo(() => {
    const worst = new Map<string, WeatherRisk>();
    for (const row of forecast.rows) {
      const risk = row.cells.some((cell) => cell.risk === "hold") ? "hold" : row.cells.some((cell) => cell.risk === "watch") ? "watch" : "clear";
      worst.set(row.project.id, risk);
    }
    return worst;
  }, [forecast]);

  /* ---- the sites, and what the filters leave ------------------------------------------- */
  const today = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, [now]);
  const openJobs = useMemo(() => data.jobs.filter((job) => job.status !== "Complete" && job.endDate >= today).sort((a, b) => jobStart(a).getTime() - jobStart(b).getTime()), [data.jobs, today]);
  const needle = query.trim().toLowerCase();
  const matchesQuery = (machine: Machine) =>
    !needle ||
    machine.equipment.name.toLowerCase().includes(needle) ||
    machine.equipment.type.toLowerCase().includes(needle) ||
    (machine.site?.name.toLowerCase().includes(needle) ?? false);
  const shownMachines = fleet.machines.filter((machine) => matchesQuery(machine) && (stateFilter.size === 0 || stateFilter.has(machine.state)));
  const counts = FLEET_STATES.reduce<Record<FleetState, number>>((acc, state) => ({ ...acc, [state]: fleet.machines.filter((m) => m.state === state).length }), {
    "on-site": 0,
    moving: 0,
    down: 0,
    yard: 0
  });
  const sites: MapSite[] = data.projects
    .filter((project) => !needle || project.name.toLowerCase().includes(needle) || shownMachines.some((machine) => machine.site?.id === project.id))
    .map((project) => ({
      project,
      machines: shownMachines.filter((machine) => machine.site?.id === project.id),
      jobCount: openJobs.filter((job) => job.projectId === project.id).length,
      weather: weatherAt.get(project.id) ?? "clear"
    }));
  const watchSites: MapSite[] = watchPoints.map((point) => ({
    project: weatherSites.find((site) => site.id === point.id)!,
    machines: [],
    jobCount: 0,
    weather: weatherAt.get(point.id) ?? "clear"
  }));
  const placedCount = fleet.machines.filter((machine) => machine.site).length;
  const attention = attentionOrder(fleet);

  const selectMachine = useCallback(
    (id: string | null) => {
      setSelectedMachineId(id);
      const machine = id ? machinesById.get(id) : null;
      if (machine?.site) setSelectedSiteId(machine.site.id);
    },
    [machinesById]
  );
  const selectSite = useCallback((id: string) => {
    setSelectedSiteId((current) => (current === id ? null : id));
    setSelectedMachineId(null);
  }, []);
  const toggleState = (state: FleetState) =>
    setStateFilter((current) => {
      const next = new Set(current);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload?.();
    } finally {
      setForecastNonce((nonce) => nonce + 1);
      setLastSynced(new Date());
      setRefreshing(false);
    }
  };

  /* ---- ForecastIQ's extra places ------------------------------------------------------- */
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchQuery, setWatchQuery] = useState("");
  const [watchError, setWatchError] = useState("");
  const [watchBusy, setWatchBusy] = useState(false);
  const addWatchPoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = watchQuery.trim();
    if (text.length < 3) {
      setWatchError("Enter a city, an address or a ZIP code.");
      return;
    }
    setWatchBusy(true);
    setWatchError("");
    try {
      const place: GeocodedAddress = await geocodeAddress(text);
      const id = `watch-${place.point.latitude.toFixed(3)}-${place.point.longitude.toFixed(3)}`;
      setWatchPoints((current) => [...current.filter((point) => point.id !== id), { id, name: place.label, latitude: place.point.latitude, longitude: place.point.longitude }].slice(-4));
      setWatchQuery("");
      setWatchOpen(false);
    } catch {
      setWatchError("That place could not be found. Try a city and state, or a full address.");
    } finally {
      setWatchBusy(false);
    }
  };

  /* ---- the Routes section: the truck route and the optimized plan (kept from the old page) -- */
  const [savedMapRoutes, setSavedMapRoutes] = useState<SavedMapRoute[]>(() => readSavedMapRoutes(data.projects, data.jobs));
  const [optimized, setOptimized] = useState(false);
  const [optimizationGoal, setOptimizationGoal] = useState<RouteGoal>("Fastest Time");
  const [truckRouteAddress, setTruckRouteAddress] = useState("");
  const [truckRouteResult, setTruckRouteResult] = useState<TruckerRouteResult | null>(null);
  const [truckRouteError, setTruckRouteError] = useState("");
  const [truckRouteLoading, setTruckRouteLoading] = useState(false);
  const [truckSuggestions, setTruckSuggestions] = useState<AddressSuggestion[]>([]);
  const [showTruckSuggestions, setShowTruckSuggestions] = useState(false);
  const [truckSuggestLoading, setTruckSuggestLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedTruckDestination, setSelectedTruckDestination] = useState<AddressSuggestion | null>(null);
  useEffect(() => {
    writeSavedMapRoutes(savedMapRoutes);
  }, [savedMapRoutes]);
  // Debounced address autocomplete for the truck destination. Skips the lookup when the field
  // still holds an already-picked suggestion so choosing one does not refetch.
  useEffect(() => {
    const text = truckRouteAddress.trim();
    if (selectedTruckDestination && truckRouteAddress === suggestionDisplayValue(selectedTruckDestination)) return;
    if (text.length < 3) {
      setTruckSuggestions([]);
      setTruckSuggestLoading(false);
      setActiveSuggestionIndex(-1);
      return;
    }
    let cancelled = false;
    setTruckSuggestLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchAddressSuggestions(text);
        if (cancelled) return;
        setTruckSuggestions(results);
        setActiveSuggestionIndex(-1);
        setShowTruckSuggestions(true);
      } catch {
        if (!cancelled) setTruckSuggestions([]);
      } finally {
        if (!cancelled) setTruckSuggestLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [truckRouteAddress, selectedTruckDestination]);

  const selectedProject = data.projects.find((project) => project.id === selectedSiteId) ?? data.projects[0];
  const hasRouteData = openJobs.length > 0 && data.projects.length > 0;
  const planRoutes = savedMapRoutes.filter(isPlanRoute);
  const effectivePlanRoutes = planRoutes.length > 0 ? planRoutes : createSavedMapRoutes(data.projects, openJobs);
  const optimizationSummary = summarizeOptimizationPlan(effectivePlanRoutes, optimizationGoal);
  const planStops = orderedRouteProjects(data.projects, openJobs).slice(0, 4);
  const truckRoute = savedMapRoutes.find(isTruckerRoute) ?? null;

  function optimizeRoutes() {
    const routes = createSavedMapRoutes(data.projects, openJobs, new Date().toISOString());
    // replace only the optimization plan — an active truck route stays saved alongside it
    setSavedMapRoutes((current) => [...current.filter(isTruckerRoute), ...routes]);
    setOptimized(routes.length > 0);
    setLastSynced(new Date());
  }

  async function createTruckerRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destinationQuery = truckRouteAddress.trim();
    if (destinationQuery.length < 5) {
      setTruckRouteError("Enter a full destination address.");
      return;
    }
    const originProject = selectedProject;
    const originLabel = originProject ? shortMapLabel(originProject.name) : "Dispatch yard";
    const originAddress = originProject?.address ?? "";
    const originPoint: GeoPoint = originProject ? { latitude: originProject.latitude, longitude: originProject.longitude } : { latitude: 30.2672, longitude: -97.7431 };
    setTruckRouteLoading(true);
    setTruckRouteError("");
    setShowTruckSuggestions(false);
    try {
      const usePicked = selectedTruckDestination && truckRouteAddress === suggestionDisplayValue(selectedTruckDestination);
      const destination: GeocodedAddress = usePicked
        ? { label: selectedTruckDestination!.label, address: selectedTruckDestination!.address, point: selectedTruckDestination!.point }
        : await geocodeAddress(destinationQuery);
      const fastest = await getFastestDrivingRoute(originPoint, destination.point);
      const distanceText = formatRouteDistance(fastest.distanceMiles);
      const durationText = formatRouteDuration(fastest.durationMinutes);
      const trafficStatus = classifyTraffic(fastest.distanceMiles, fastest.durationMinutes);
      const routePoints = fastest.points.length >= 2 ? fastest.points : [originPoint, destination.point];
      const savedRoute: SavedMapRoute = {
        id: `trucker-route-${Date.now()}`,
        className: "route-blue",
        label: `Truck route to ${destination.label}`,
        points: routePoints,
        vehiclePoint: routePoints[Math.max(0, Math.min(routePoints.length - 1, Math.floor(routePoints.length * 0.35)))],
        stopPoint: destination.point,
        destinationAddress: destination.address,
        distanceText,
        durationText,
        trafficStatus,
        routeSource: fastest.source,
        savedAt: new Date().toISOString()
      };
      setSavedMapRoutes((current) => [...current.filter((route) => !isTruckerRoute(route)), savedRoute]);
      setTruckRouteResult({ destinationLabel: destination.label, destinationAddress: destination.address, originLabel, originAddress, durationText, distanceText, trafficStatus, source: fastest.source });
      setShowTraffic(true);
      setLastSynced(new Date());
    } catch {
      setTruckRouteError("That destination could not be found. Try a full street address, city, and state.");
    } finally {
      setTruckRouteLoading(false);
    }
  }

  function selectTruckSuggestion(suggestion: AddressSuggestion) {
    setSelectedTruckDestination(suggestion);
    setTruckRouteAddress(suggestionDisplayValue(suggestion));
    setTruckSuggestions([]);
    setShowTruckSuggestions(false);
    setActiveSuggestionIndex(-1);
    setTruckRouteError("");
  }

  function handleTruckDestinationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setShowTruckSuggestions(false);
      setActiveSuggestionIndex(-1);
      return;
    }
    if (!showTruckSuggestions || truckSuggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % truckSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current <= 0 ? truckSuggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      selectTruckSuggestion(truckSuggestions[activeSuggestionIndex]);
    }
  }

  function clearTruckRoute() {
    setSavedMapRoutes((current) => current.filter((route) => !isTruckerRoute(route)));
    setTruckRouteResult(null);
    setTruckRouteError("");
    setTruckRouteAddress("");
    setSelectedTruckDestination(null);
    setTruckSuggestions([]);
    setShowTruckSuggestions(false);
    setActiveSuggestionIndex(-1);
    setLastSynced(new Date());
  }

  /* ---- what each section shows ------------------------------------------------------- */
  const projectName = (id: string) => data.projects.find((project) => project.id === id)?.name ?? "Unassigned";
  const crewFor = (job: Job) => {
    const assignment = data.assignments.find((item) => item.jobId === job.id);
    return data.crews.find((crew) => crew.id === assignment?.crewId) ?? null;
  };
  const userFor = (update: FieldUpdate) => data.users.find((user) => user.id === update.userId) ?? data.activeUser;
  const jobFor = (update: FieldUpdate) => (update.jobId ? data.jobs.find((job) => job.id === update.jobId) : undefined);

  const routeForMap: GeoPoint[] | null = selected?.move && selected.site
    ? liveRoute && liveRoute.machineId === selected.equipment.id
      ? liveRoute.points
      : [selected.site, selected.move.to]
    : null;

  const holdsToday = forecast.rows
    .map((row) => ({ row, cell: row.cells.slice(0, 4).find((cell) => cell.risk === "hold") ?? null }))
    .filter((item): item is { row: (typeof forecast.rows)[number]; cell: NonNullable<(typeof forecast.rows)[number]["cells"][number]> } => item.cell !== null);

  const machineCard = selected && (
    <article className="mx-card" aria-label={`${selected.equipment.name}: where it is and where it is going`}>
      <header className="mx-card-head">
        <span className={`mx-disc is-${selected.state}`} aria-hidden="true">
          <Truck size={16} />
        </span>
        <div className="mx-card-title">
          <strong>{selected.equipment.name}</strong>
          <em>
            {selected.equipment.type} · {FLEET_STATE_LABEL[selected.state]}
            {selected.site ? ` · ${selected.site.name}` : ""}
          </em>
        </div>
        <button type="button" className="mx-card-close" onClick={() => selectMachine(null)} aria-label="Close">
          <X size={16} />
        </button>
      </header>
      {selectedMove ? (
        <>
          <div className="mx-card-route">
            <b>{selected.site?.name}</b>
            <ArrowRight size={16} aria-hidden="true" />
            <b>{selectedMove.to.name}</b>
            <span className={`mx-tag is-${selectedMove.risk}`}>{RISK_LABEL[selectedMove.risk]}</span>
          </div>
          <dl className="mx-facts">
            <div>
              <dt>Needed by</dt>
              <dd>{formatWhen(selectedMove.neededBy)}</dd>
            </div>
            <div>
              <dt>Drive</dt>
              <dd>
                {selectedMove.etaMinutes} min · {selectedMove.distanceMiles.toFixed(1)} mi
                {liveRoute?.machineId === selected.equipment.id && liveRoute.source === "live" ? "" : " (est.)"}
              </dd>
            </div>
            <div>
              <dt>{selectedMove.slackMinutes < 0 ? "Behind by" : "To spare"}</dt>
              <dd>{Math.abs(selectedMove.slackMinutes)} min</dd>
            </div>
          </dl>
          <p className="mx-card-why">
            {selectedMove.job.phase} at {selectedMove.to.name} needs {aKind(selected.equipment)} {describeLead(now, selectedMove.neededBy)}.{" "}
            {selected.job && selected.job.endDate >= today
              ? `It is on ${selected.job.phase} at ${selected.site?.name} through ${new Date(`${selected.job.endDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}. `
              : `Nothing keeps it at ${selected.site?.name}. `}
            {selectedMove.slackMinutes >= 0
              ? `Leaving by ${formatClock(new Date(selectedMove.neededBy.getTime() - selectedMove.etaMinutes * 60000))} gets it there in time.`
              : "It cannot get there in time from here; move the job or bring in another machine."}
          </p>
        </>
      ) : (
        <p className="mx-card-why">
          {selected.state === "yard"
            ? "Not on the map: it has no site. Assign it to one from Equipment and it appears here."
            : selected.state === "down"
              ? `Down for maintenance at ${selected.site?.name}.${selected.attention ? ` ${selected.attention}` : ""}`
              : selected.job
                ? `On ${selected.job.phase} at ${selected.site?.name} through ${new Date(`${selected.job.endDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}. Nothing on the schedule asks for it elsewhere.`
                : `At ${selected.site?.name}. Nothing on the schedule asks for it elsewhere.`}
        </p>
      )}
      <div className="mx-card-actions">
        <button type="button" className="mx-btn mx-btn-primary" onClick={() => onOpenRecord("equipment", selected.equipment.id)}>
          Open in Equipment
        </button>
        {selectedMove && (
          <button type="button" className="mx-btn" onClick={() => onOpenPage("schedule")}>
            See the schedule
          </button>
        )}
      </div>
    </article>
  );

  const attentionRail = (
    <aside className="mx-attention" aria-label="Needs attention">
      <header className="mx-attention-head">
        <h3>Needs attention</h3>
        <span className="mx-count">{attention.length + fleet.gaps.length + holdsToday.length}</span>
      </header>
      {attention.length + fleet.gaps.length + holdsToday.length === 0 ? (
        <p className="mx-attention-empty">Every machine is where the schedule wants it, and the weather is holding.</p>
      ) : (
        <ol className="cc-list mx-attention-list">
          {attention.map((machine) => (
            <li key={machine.equipment.id}>
              <button type="button" className="mx-attention-row" onClick={() => selectMachine(machine.equipment.id)} aria-pressed={selected?.equipment.id === machine.equipment.id}>
                <span className="mx-attention-name">
                  {machine.equipment.name}
                  <span className={`mx-tag is-${machine.move?.risk ?? machine.state}`}>{machine.move ? RISK_LABEL[machine.move.risk] : FLEET_STATE_LABEL[machine.state]}</span>
                </span>
                <span className="mx-attention-why">{machine.attention}</span>
              </button>
            </li>
          ))}
          {fleet.gaps.map((gap) => (
            <li key={gap.job.id}>
              <button type="button" className="mx-attention-row" onClick={() => selectSite(gap.project.id)} aria-pressed={selectedSiteId === gap.project.id && !selected}>
                <span className="mx-attention-name">
                  No {gap.needed.toLowerCase()} in the fleet
                  <span className="mx-tag is-gap">Gap</span>
                </span>
                <span className="mx-attention-why">
                  {gap.job.phase} at {gap.project.name} needs one {describeLead(now, gap.neededBy)}.
                </span>
              </button>
            </li>
          ))}
          {holdsToday.map(({ row, cell }) => (
            <li key={`hold-${row.project.id}`}>
              <button type="button" className="mx-attention-row" onClick={() => selectSite(row.project.id)} aria-pressed={selectedSiteId === row.project.id && !selected}>
                <span className="mx-attention-name">
                  {row.project.name}
                  <span className="mx-tag is-hold">Weather hold</span>
                </span>
                <span className="mx-attention-why">
                  {cell.cause ? CAUSE_LABEL[cell.cause] : "weather"} from {columnLabel(cell.at, null)} — {openJobs.filter((job) => job.projectId === row.project.id).length} open{" "}
                  {openJobs.filter((job) => job.projectId === row.project.id).length === 1 ? "job" : "jobs"} there.
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <footer className="mx-attention-foot">
        <button type="button" className="mx-link" onClick={() => onOpenPage("equipment")}>
          View all in Equipment <ExternalLink size={13} aria-hidden="true" />
        </button>
      </footer>
    </aside>
  );

  const sections: MapSection[] = [
    {
      id: "map",
      title: "Live map",
      icon: MapIcon,
      group: "Field",
      blurb: "Every site and machine on the map; pick a machine to see where it is going.",
      action: (
        <span className="mx-panel-note">
          {placedCount} of {fleet.machines.length} {fleet.machines.length === 1 ? "machine" : "machines"} placed
          {fleet.machines.length - placedCount > 0 ? ` · ${fleet.machines.length - placedCount} at the yard` : ""}
        </span>
      ),
      body: (
        <div className="mx-map-panel">
          <div className="mx-map-stage">
            <LiveMap
              sites={[...sites, ...watchSites]}
              /* the map gets the move the CARD shows — the live road time once it has arrived — or
                 its badge said 21 min over a route the card called 5 */
              selected={selected && selectedMove ? { ...selected, move: selectedMove } : selected}
              selectedSiteId={selectedSiteId}
              route={routeForMap}
              truckRoute={truckRoute}
              showWeather={showWeather}
              showTraffic={showTraffic}
              onSelectMachine={selectMachine}
              onSelectSite={selectSite}
            />
            {machineCard}
          </div>
          {attentionRail}
        </div>
      ),
      w: 6,
      h: 9
    },
    {
      id: "forecast",
      title: "ForecastIQ · weather",
      icon: CloudSun,
      group: "Attention",
      blurb: "The forecast at every site, read against the schedule: which jobs the weather puts at risk.",
      action: (
        <button type="button" className="mx-panel-action" onClick={() => setWatchOpen((open) => !open)} aria-expanded={watchOpen}>
          <Plus size={14} aria-hidden="true" /> Add a location
        </button>
      ),
      body: (
        <div className="mx-forecast">
          <div className="mx-forecast-head">
            <span className="mx-forecast-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              {forecastSource === "forecast"
                ? "Live forecast at each site"
                : forecastSource === "alerts"
                  ? "From your weather alerts — the forecast service could not be reached"
                  : data.projects.length === 0
                    ? "Add a project to read the weather at its site"
                    : "No forecast yet"}
            </span>
            <div className="mx-forecast-figure">
              <strong>
                <AnimatedFigure text={String(forecast.jobsAtRisk.length)} />
              </strong>
              <span>
                {forecast.jobsAtRisk.length === 1 ? "job" : "jobs"} at weather risk in the next {forecast.horizonHours} hours
              </span>
            </div>
          </div>
          {watchOpen && (
            <form className="mx-watch-form" onSubmit={addWatchPoint}>
              <label>
                <span>Watch another place</span>
                <input value={watchQuery} onChange={(event) => setWatchQuery(event.target.value)} placeholder="City, address or ZIP code" aria-label="City, address or ZIP code" />
              </label>
              <button type="submit" className="mx-btn" disabled={watchBusy}>
                {watchBusy ? "Finding…" : "Add"}
              </button>
              {watchError && (
                <p className="mx-error" role="alert">
                  {watchError}
                </p>
              )}
            </form>
          )}
          {forecast.rows.length > 0 && (
            <div className="mx-matrix" role="table" aria-label="Weather risk by site and time">
              <div className="mx-matrix-row mx-matrix-head" role="row">
                <span role="columnheader" className="mx-matrix-site">
                  Site
                </span>
                {forecast.columns.map((at, index) => (
                  <span role="columnheader" key={at.getTime()} className="mx-matrix-col">
                    {columnLabel(at, index === 0 ? null : forecast.columns[index - 1])}
                  </span>
                ))}
              </div>
              {forecast.rows.map((row) => (
                <div className="mx-matrix-row" role="row" key={row.project.id}>
                  <span role="rowheader" className="mx-matrix-site">
                    {row.project.name}
                  </span>
                  {row.cells.map((cell) => (
                    <span
                      role="cell"
                      key={cell.at.getTime()}
                      className={`mx-cell is-${cell.risk}`}
                      title={`${row.project.name}, ${columnLabel(cell.at, null)}: ${cell.risk === "clear" ? "clear" : `${cell.cause ?? "weather"} ${cell.risk}`}`}
                    >
                      <span className="mx-sr">{cell.risk === "clear" ? "clear" : `${cell.cause ?? "weather"} ${cell.risk}`}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          <ul className="mx-forecast-counts">
            <li>
              <b>{forecast.counts.rain}</b> rain-outs likely
            </li>
            <li>
              <b>{forecast.counts.wind}</b> wind holds for lifts and cranes
            </li>
            <li>
              <b>{forecast.counts.heat + forecast.counts.cold}</b> temperature advisories
            </li>
          </ul>
          {forecast.jobsAtRisk.length > 0 && (
            <ul className="cc-list mx-risk-list">
              {forecast.jobsAtRisk.slice(0, 4).map((item) => (
                <li key={item.job.id}>
                  <button type="button" className="mx-risk-row" onClick={() => selectSite(item.project.id)}>
                    <span className={`mx-tag is-${item.risk}`}>{item.risk === "hold" ? "Hold" : "Watch"}</span>
                    <span className="mx-risk-copy">
                      <strong>{item.job.phase}</strong> at {item.project.name} — {CAUSE_LABEL[item.cause]} {columnLabel(item.at, null)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tradeWeather && (
            <p className="mx-forecast-rule">
              <b>{tradeWeather.title}:</b> {tradeWeather.rule}
            </p>
          )}
        </div>
      ),
      w: 6,
      h: 5
    },
    {
      id: "fleet",
      title: "Equipment",
      icon: Truck,
      group: "Field",
      blurb: "Every machine, its site, and the next place the schedule sends it.",
      action: (
        <button type="button" className="mx-panel-action" onClick={() => onOpenPage("equipment")}>
          Open Equipment <ExternalLink size={13} aria-hidden="true" />
        </button>
      ),
      body:
        shownMachines.length > 0 ? (
          <ul className="cc-list mx-fleet-list" aria-label="Machines">
            {shownMachines.map((machine) => {
              const move = withLiveRoute(machine, liveRoute);
              return (
                <li key={machine.equipment.id}>
                  <button type="button" className="mx-fleet-row" onClick={() => selectMachine(selected?.equipment.id === machine.equipment.id ? null : machine.equipment.id)} aria-pressed={selected?.equipment.id === machine.equipment.id}>
                    <span className={`mx-disc is-${machine.state}`} aria-hidden="true">
                      <Truck size={15} />
                    </span>
                    <span className="mx-fleet-copy">
                      <strong>{machine.equipment.name}</strong>
                      <em>
                        {machine.equipment.type} · {machine.site ? machine.site.name : "no site"}
                      </em>
                    </span>
                    <span className="mx-fleet-next">
                      {move ? (
                        <>
                          <ArrowRight size={13} aria-hidden="true" /> {move.to.name} · {formatWhen(move.neededBy)}
                        </>
                      ) : machine.job ? (
                        `On ${machine.job.phase}`
                      ) : (
                        "Nothing scheduled elsewhere"
                      )}
                    </span>
                    <span className={`mx-tag is-${move ? move.risk : machine.state}`}>{move ? RISK_LABEL[move.risk] : FLEET_STATE_LABEL[machine.state]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote icon={Truck} title={fleet.machines.length === 0 ? "No equipment yet" : "No machines match"} detail={fleet.machines.length === 0 ? "Add machines from Equipment and they take their sites here." : "Clear the search or the status chips to bring them back."} />
        ),
      w: 3,
      h: 6
    },
    {
      id: "jobs",
      title: "Today's field jobs",
      icon: MapPin,
      group: "Field",
      blurb: "What is scheduled at each site, soonest first; a row lights its site on the map.",
      action: (
        <button type="button" className="mx-panel-action" onClick={() => onOpenPage("schedule")}>
          Open Schedule <ExternalLink size={13} aria-hidden="true" />
        </button>
      ),
      body:
        openJobs.length > 0 ? (
          <ul className="cc-list mx-job-list" aria-label="Field jobs">
            {openJobs.slice(0, 8).map((job) => {
              const crew = crewFor(job);
              return (
                <li key={job.id}>
                  <button type="button" className="mx-job-row" onClick={() => selectSite(job.projectId)} aria-pressed={selectedSiteId === job.projectId && !selected}>
                    <span className="mx-job-copy">
                      <strong>{job.phase}</strong>
                      <em>
                        {projectName(job.projectId)} · {job.location}
                      </em>
                      <small>{crew ? crew.name : "No crew booked"}</small>
                    </span>
                    <span className="mx-job-when">
                      <strong>{job.startDate === today ? job.startTime : formatWhen(jobStart(job))}</strong>
                      <span className={`badge ${statusTone(job.status)}`}>{job.status}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote icon={MapPin} title="No jobs on the map" detail="Jobs appear here once they are scheduled." />
        ),
      w: 3,
      h: 6
    },
    {
      id: "updates",
      title: "Field updates",
      icon: MessageCircle,
      group: "Field",
      blurb: "The latest notes and photos from the crews.",
      action: (
        <button type="button" className="mx-panel-action" onClick={() => onOpenPage("field")}>
          <Plus size={14} aria-hidden="true" /> Add field update
        </button>
      ),
      body:
        data.fieldUpdates.length > 0 ? (
          <ul className="cc-list mx-update-list" aria-label="Field updates">
            {data.fieldUpdates.slice(0, 5).map((update, index) => {
              const user = userFor(update);
              const job = jobFor(update);
              return (
                <li key={update.id}>
                  <article className="mx-update-row">
                    <span className="avatar mx-update-avatar" aria-hidden="true">
                      {user.avatar}
                    </span>
                    <div className="mx-update-copy">
                      <header>
                        <strong>{user.name}</strong>
                        <em>
                          {user.title}
                          {job ? ` - ${job.name}` : ""}
                        </em>
                        <span className={`badge ${statusTone(update.status)}`}>{update.status}</span>
                        <time dateTime={update.createdAt}>{formatTime(update.createdAt)}</time>
                      </header>
                      <p>{update.message}</p>
                      {index === 0 && update.photos.length > 0 && (
                        <div className="mx-update-photos">
                          {update.photos.slice(0, 4).map((photo, photoIndex) => (
                            <PhotoThumb key={`${update.id}-${photoIndex}`} photo={photo} />
                          ))}
                          {update.photos.length > 4 && <b>+{update.photos.length - 4}</b>}
                        </div>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote icon={MessageCircle} title="No field updates yet" detail="Updates from crews and supervisors appear here." />
        ),
      w: 3,
      h: 5
    },
    {
      id: "routes",
      title: "Routes",
      icon: Route,
      group: "Tools",
      blurb: "A traffic-aware truck route from the selected site, and the optimized run between sites.",
      action: hasRouteData ? (
        <button type="button" className={`mx-panel-action${optimized ? " is-on" : ""}`} onClick={optimizeRoutes} aria-pressed={optimized}>
          {optimized ? "Optimized" : "Optimize all routes"}
        </button>
      ) : undefined,
      body: (
        <div className="mx-routes">
          <form className="mx-route-form" onSubmit={createTruckerRoute} autoComplete="off">
            <label className="mx-route-field">
              <span>Trucker destination</span>
              <input
                value={truckRouteAddress}
                onChange={(event) => {
                  setTruckRouteAddress(event.target.value);
                  setSelectedTruckDestination(null);
                }}
                onFocus={() => {
                  if (truckSuggestions.length > 0) setShowTruckSuggestions(true);
                }}
                onBlur={() => window.setTimeout(() => setShowTruckSuggestions(false), 150)}
                onKeyDown={handleTruckDestinationKeyDown}
                placeholder={`From ${selectedProject ? shortMapLabel(selectedProject.name) : "the yard"} to…`}
                aria-label="Trucker destination address"
                autoComplete="off"
                role="combobox"
                aria-expanded={showTruckSuggestions && truckSuggestions.length > 0}
                aria-controls="trucker-destination-suggestions"
                aria-autocomplete="list"
              />
              {showTruckSuggestions && (truckSuggestions.length > 0 || truckSuggestLoading) && (
                <ul className="mx-suggestions" id="trucker-destination-suggestions" role="listbox">
                  {truckSuggestions.map((suggestion, index) => (
                    <li key={suggestion.id} role="option" aria-selected={index === activeSuggestionIndex}>
                      <button type="button" className={index === activeSuggestionIndex ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveSuggestionIndex(index)} onClick={() => selectTruckSuggestion(suggestion)}>
                        <MapPin size={14} aria-hidden="true" />
                        <span>
                          <strong>{suggestion.label}</strong>
                          {suggestion.context && <em>{suggestion.context}</em>}
                        </span>
                      </button>
                    </li>
                  ))}
                  {truckSuggestions.length === 0 && truckSuggestLoading && <li className="mx-suggestions-empty">Searching addresses…</li>}
                </ul>
              )}
            </label>
            <button type="submit" className="mx-btn mx-btn-primary" disabled={truckRouteLoading}>
              <Route size={15} aria-hidden="true" /> {truckRouteLoading ? "Finding route…" : "Create Traffic Route"}
            </button>
            {truckRouteError && (
              <p className="mx-error" role="alert">
                {truckRouteError}
              </p>
            )}
          </form>
          {truckRouteResult && (
            <article className={`mx-route-result is-${truckRouteResult.trafficStatus.toLowerCase()}`}>
              <header>
                <span>
                  <Truck size={15} aria-hidden="true" /> Fastest truck route
                </span>
                <span className="mx-route-tools">
                  <span className={`mx-tag is-${truckRouteResult.trafficStatus === "Heavy" ? "late" : truckRouteResult.trafficStatus === "Moderate" ? "tight" : "on-time"}`}>{truckRouteResult.trafficStatus} traffic</span>
                  <button type="button" className="mx-link" onClick={clearTruckRoute}>
                    <X size={13} aria-hidden="true" /> Clear
                  </button>
                </span>
              </header>
              <dl className="mx-facts">
                <div>
                  <dt>From</dt>
                  <dd>{truckRouteResult.originLabel}</dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd>{truckRouteResult.destinationLabel}</dd>
                </div>
                <div>
                  <dt>Drive time</dt>
                  <dd>{truckRouteResult.durationText}</dd>
                </div>
                <div>
                  <dt>Distance</dt>
                  <dd>{truckRouteResult.distanceText}</dd>
                </div>
              </dl>
              <p className="mx-muted">{truckRouteResult.source === "live" ? "Live road route, drawn on the map with Traffic on." : "Estimated route — the routing service could not be reached."}</p>
              {planRoutes.length > 0 && <p className="mx-muted">Your optimized plan is saved underneath — clear this route to return to it.</p>}
            </article>
          )}
          {hasRouteData ? (
            <div className="mx-optimizer">
              <div className="mx-optimizer-figure">
                <span>Estimated total drive time</span>
                <strong>{optimizationSummary.driveTime}</strong>
                <em>
                  ↓ {optimizationSummary.savings}% {optimizationSummary.savingsLabel} vs current routes
                </em>
              </div>
              <dl className="mx-facts">
                <div>
                  <dt>First stop</dt>
                  <dd>{planStops[0]?.name ?? projectName(openJobs[0]?.projectId ?? "")}</dd>
                </div>
                <div>
                  <dt>Last stop</dt>
                  <dd>{planStops[planStops.length - 1]?.name ?? projectName(openJobs[openJobs.length - 1]?.projectId ?? "")}</dd>
                </div>
                <div>
                  <dt>Total distance</dt>
                  <dd>{optimizationSummary.totalDistance}</dd>
                </div>
              </dl>
              <div className="mx-goal" role="group" aria-label="Optimization goal">
                {routeGoalOptions.map((goal) => (
                  <button type="button" key={goal} className={optimizationGoal === goal ? "is-active" : ""} onClick={() => setOptimizationGoal(goal)} aria-pressed={optimizationGoal === goal}>
                    {goal}
                  </button>
                ))}
              </div>
              <button type="button" className="mx-btn mx-btn-primary" onClick={optimizeRoutes}>
                <Sparkles size={15} aria-hidden="true" /> Optimize Routes
              </button>
            </div>
          ) : (
            <EmptyNote icon={Route} title="No route data yet" detail="Add jobs and project locations before optimizing routes." />
          )}
        </div>
      ),
      w: 3,
      h: 6
    },
    {
      id: "sites",
      title: "Job sites",
      icon: Building2,
      group: "Field",
      blurb: "One card per site with its open jobs, status and coordinates.",
      action: <span className="mx-panel-note">{sites.length} {sites.length === 1 ? "site" : "sites"}</span>,
      body:
        sites.length > 0 ? (
          <div className="mx-site-cards">
            {sites.map((site) => (
              <LocationMap
                key={site.project.id}
                location={site.project.name}
                coordinates={formatGeoCoordinates(site.project.latitude, site.project.longitude)}
                jobCount={site.jobCount}
                meta={`${site.project.location} · ${site.project.status}`}
                accent={mapSiteAccent(site.project.status)}
                live
                selected={site.project.id === selectedSiteId}
                onSelect={() => selectSite(site.project.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyNote icon={Building2} title={data.projects.length === 0 ? "No job sites yet" : "No sites match"} detail={data.projects.length === 0 ? "Create a project and its jobs to see them here." : "Clear the search to bring the other sites back."} />
        ),
      w: 6,
      h: 6
    }
  ];

  /* ---- the board -------------------------------------------------------------------- */
  // the sections are rebuilt every render; the board's defaults only change when their shape does
  const signature = sections.map((section) => `${section.id}:${section.w}x${section.h}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => defaultLayout(sections), [signature]);
  const board = usePersistentLayout(`bf:map:layout:${data.activeUser.id}`, defaults, defaults, { limits: sectionLimits, settingKey: "map:layout" });
  const [customizing, setCustomizing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addedFocus, setAddedFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 900px)");
    const apply = () => setStacked(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  const present = new Set(sections.map((section) => section.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => compact(board.layout.filter((item) => present.has(item.id))), [board.layout, signature]);
  const panels: Record<string, DashPanel> = Object.fromEntries(sections.map((section) => [section.id, { id: section.id, title: section.title, icon: section.icon, action: section.action, body: section.body }]));
  const panelTitles: Record<string, string> = Object.fromEntries(sections.map((section) => [section.id, section.title]));

  const eyebrowDate = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="map-ops-page page-stack sched-rx has-board" ref={rootRef}>
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      <div className={`dash-rx hs-home sched-board-host${customizing ? " is-customizing" : ""}${editing ? " is-rearranging" : ""}`}>
        <div className="sched-board-topline">
          <div className="schedule-title-row dx-hero" data-reveal>
            <span className="dx-eyebrow">
              <span className="dx-dot" />
              Map &amp; Field Ops · {eyebrowDate}
            </span>
            <h1 className="dx-title" data-tutorial-id="map-page-title">
              <TextReveal text="Every site, live." />
            </h1>
            <p className="dx-sub">
              {fleet.machines.length} {fleet.machines.length === 1 ? "machine" : "machines"} across {data.projects.length} {data.projects.length === 1 ? "site" : "sites"}. Pick a machine to see where it is and where the schedule sends it next; ForecastIQ reads the weather at every site.
            </p>
          </div>
          {!stacked && (
            <BoardLayoutControls
              customizing={customizing}
              pickerOpen={pickerOpen}
              onToggleCustomize={() => setCustomizing((current) => !current)}
              onReset={() => {
                board.reset();
                setCustomizing(false);
              }}
              onAdd={() => setPickerOpen(true)}
            />
          )}
        </div>
        {customizing && <BoardCustomizeHint />}
        {customizing && board.hidden.length > 0 && <HiddenPanelChips hidden={board.hidden} titles={panelTitles} onShow={board.show} />}
        <div className="schedule-control-row mx-controls" data-reveal>
          <div className="filter-strip mx-find">
            <label className="mx-search">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a site or machine" aria-label="Find a site or machine" />
            </label>
            <div className="mx-chips" role="group" aria-label="Fleet status">
              {FLEET_STATES.map((state) => (
                <button type="button" key={state} className={`mx-chip is-${state}`} onClick={() => toggleState(state)} aria-pressed={stateFilter.has(state)}>
                  <i aria-hidden="true" />
                  {FLEET_STATE_LABEL[state]}
                  <b>{counts[state]}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="filter-strip mx-layers">
            <button type="button" className="mx-toggle" onClick={() => setShowWeather((current) => !current)} aria-pressed={showWeather}>
              <CloudSun size={15} aria-hidden="true" /> Weather
            </button>
            <button type="button" className="mx-toggle" onClick={() => setShowTraffic((current) => !current)} aria-pressed={showTraffic}>
              <Truck size={15} aria-hidden="true" /> Traffic
            </button>
            <span className="mx-live" role="status">
              <i aria-hidden="true" /> Live · synced {formatClock(lastSynced)}
            </span>
            <button type="button" className="mx-toggle" onClick={refresh} disabled={refreshing}>
              <RefreshCcw size={15} aria-hidden="true" /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            {fleet.gaps.length > 0 && (
              <span className="mx-gap-note">
                <TriangleAlert size={14} aria-hidden="true" /> {fleet.gaps.length} {fleet.gaps.length === 1 ? "job needs" : "jobs need"} a machine the fleet lacks
              </span>
            )}
          </div>
        </div>
        <DashBoard
          layout={shown}
          panels={panels}
          limits={sectionLimits}
          onChange={board.update}
          onFit={board.fit}
          fitToContent={!board.stored || board.fitting}
          onEditingChange={setEditing}
          panelFocus={addedFocus}
          editable={customizing}
          onHide={customizing ? board.hide : undefined}
        />
        <SectionPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          options={sections.map(
            (section): SectionOption => ({
              id: section.id,
              title: section.title,
              group: section.group,
              blurb: section.blurb,
              icon: section.icon,
              onBoard: !board.hidden.includes(section.id)
            })
          )}
          onAdd={(id) => {
            board.show(id);
            setAddedFocus({ id, nonce: Date.now() + Math.random() });
          }}
        />
      </div>
    </div>
  );
}

function EmptyNote({ icon: Icon, title, detail }: { icon: typeof Truck; title: string; detail: string }) {
  return (
    <div className="inline-empty-state">
      <Icon size={28} />
      <span>
        <strong>{title}</strong>
        <em>{detail}</em>
      </span>
    </div>
  );
}

/** A field update's attachment: a picture when it is one, a file link when it is one, a swatch otherwise. */
function PhotoThumb({ photo }: { photo: string }) {
  if (/^data:image\//i.test(photo) || /^(https?:|blob:|\/)/i.test(photo)) {
    return <img className="mx-photo" src={photo} alt="Field update attachment" loading="lazy" />;
  }
  if (/^data:/i.test(photo)) {
    return (
      <a className="mx-photo mx-photo-file" href={photo} target="_blank" rel="noreferrer" aria-label="Open attachment">
        <CalendarDays size={16} aria-hidden="true" />
      </a>
    );
  }
  return <span className="mx-photo mx-photo-swatch" aria-hidden="true" />;
}
