/**
 * The live map (2026-09-22): every site and every machine on real streets, with the selected
 * machine's route to where it is going.
 *
 * LEAFLET, NOT A GLOBE. The last real map here was an OpenStreetMap iframe, replaced by site
 * cards on request; the globe on the landing page was removed for lag (it re-rendered WebGL
 * every frame). Leaflet is neither: DOM tiles that sit still until someone pans, no frame loop
 * while idle. The tiles are CARTO's label-free basemap, desaturated in CSS so the map reads in
 * the program's greys and every label on it is ours.
 *
 * REACT OWNS THE STATE, LEAFLET OWNS THE PIXELS. Pins are Leaflet markers with HTML icons; what
 * they show comes from props, and clicking one calls back into React. Nothing React renders is
 * inside Leaflet's container, and nothing Leaflet draws is read back by React — that boundary
 * is what keeps the two from fighting over the same nodes.
 *
 * WITHOUT A WINDOW (jsdom, a hidden tab) the map has no size, so it is never created: the pins
 * are listed instead, in an accessible list that is ALWAYS rendered. That list is the map for a
 * keyboard and a screen reader, and it is how the tests reach a pin.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { Project } from "@buildflow/shared";
import type { GeoPoint, SavedMapRoute } from "./geo";
import type { Machine } from "./fleet";
import type { WeatherRisk } from "./forecast";

export type MapSite = { project: Project; machines: Machine[]; jobCount: number; weather: WeatherRisk };

export type LiveMapProps = {
  sites: MapSite[];
  selected: Machine | null;
  selectedSiteId: string | null;
  /** The selected machine's road to where it is going, when there is one. */
  route: GeoPoint[] | null;
  /** The truck route from the Routes section, drawn when Traffic is on. */
  truckRoute: SavedMapRoute | null;
  showWeather: boolean;
  showTraffic: boolean;
  onSelectMachine: (id: string | null) => void;
  onSelectSite: (id: string) => void;
};

const TILES = "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Several machines on one site fan out around its pin, in pixels, so none hides another. */
const fan = (index: number, count: number): [number, number] => {
  if (count === 1) return [0, -30];
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  const radius = 34;
  return [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius) - 8];
};

const MACHINE_GLYPH: Record<string, string> = {
  crane: "🏗",
  lift: "⬆",
  pump: "⛽",
  excavator: "⛏",
  truck: "🚚",
  dozer: "🚜",
  loader: "🚜"
};
const glyphFor = (type: string) => {
  const key = type.toLowerCase();
  return Object.entries(MACHINE_GLYPH).find(([kind]) => key.includes(kind))?.[1] ?? "⚙";
};

export function LiveMap({ sites, selected, selectedSiteId, route, truckRoute, showWeather, showTraffic, onSelectMachine, onSelectSite }: LiveMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{ pins: L.LayerGroup; routes: L.LayerGroup } | null>(null);
  const [ready, setReady] = useState(false);
  // the callbacks change every render; the markers read the latest through a ref
  const handlers = useRef({ onSelectMachine, onSelectSite });
  handlers.current = { onSelectMachine, onSelectSite };

  const placed = useMemo(() => sites.filter((site) => Number.isFinite(site.project.latitude) && Number.isFinite(site.project.longitude)), [sites]);

  /* Create the map once the host has a size, and follow the host from then on.

     NOT at mount: the panel board places its panels absolutely and fits their heights AFTER
     they mount, so at the moment of the first layout the host is 0×0 and a map made then would
     be a map of nothing (measured on the first live look: "The map draws once it has room"
     stayed up for good). The observer fires when the board hands the panel its size, and again
     on every resize after — Customize, Reset layout, a window — where the map re-measures. In
     jsdom the observer is a no-op, so the map is never made there and the pin list stands in. */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const create = () => {
      if (mapRef.current || host.clientWidth === 0 || host.clientHeight === 0) return;
      const map = L.map(host, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, preferCanvas: false });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(TILES, { attribution: ATTRIBUTION, subdomains: "abcd", maxZoom: 19, className: "mx-tiles" }).addTo(map);
      const pins = L.layerGroup().addTo(map);
      const routes = L.layerGroup().addTo(map);
      mapRef.current = map;
      layersRef.current = { pins, routes };
      // the wheel zooms only once the map has been clicked, so a page scroll never lands in it
      map.on("focus", () => map.scrollWheelZoom.enable());
      map.on("blur", () => map.scrollWheelZoom.disable());
      setReady(true);
    };
    const observer = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
      else create();
    });
    observer.observe(host);
    create();
    return () => {
      observer.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  /* Pins: one per site, one per machine on it. Redrawn whenever what they show changes. */
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.pins.clearLayers();
    for (const site of placed) {
      const { project } = site;
      const isSelectedSite = project.id === selectedSiteId;
      const siteIcon = L.divIcon({
        className: `mx-pin mx-pin-site${isSelectedSite ? " is-selected" : ""}${showWeather && site.weather !== "clear" ? ` is-${site.weather}` : ""}`,
        html: `<span class="mx-pin-dot" aria-hidden="true"></span><span class="mx-pin-label">${escapeHtml(project.name)}<em>${site.jobCount} ${site.jobCount === 1 ? "job" : "jobs"}${showWeather && site.weather !== "clear" ? ` · weather ${site.weather}` : ""}</em></span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      L.marker([project.latitude, project.longitude], { icon: siteIcon, keyboard: false, riseOnHover: true })
        .on("click", () => handlers.current.onSelectSite(project.id))
        .addTo(layers.pins);
      site.machines.forEach((machine, index) => {
        const [dx, dy] = fan(index, site.machines.length);
        const isSelected = selected?.equipment.id === machine.equipment.id;
        const icon = L.divIcon({
          className: `mx-pin mx-pin-machine is-${machine.state}${isSelected ? " is-selected" : ""}${machine.move?.risk === "late" ? " is-late" : ""}`,
          html: `<span class="mx-pin-machine-disc">${glyphFor(machine.equipment.type)}</span><span class="mx-pin-machine-label">${escapeHtml(machine.equipment.name)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [-dx, -dy]
        });
        L.marker([project.latitude, project.longitude], { icon, keyboard: false, riseOnHover: true, zIndexOffset: isSelected ? 1000 : 100 })
          .on("click", () => handlers.current.onSelectMachine(isSelected ? null : machine.equipment.id))
          .addTo(layers.pins);
      });
    }
  }, [placed, selected, selectedSiteId, showWeather, ready]);

  /* Routes: the selected machine's, and the truck route while Traffic is on. */
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.routes.clearLayers();
    if (route && route.length >= 2 && selected?.move) {
      const line = route.map((point) => [point.latitude, point.longitude] as [number, number]);
      L.polyline(line, { className: "mx-route mx-route-under", weight: 9, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(layers.routes);
      L.polyline(line, { className: `mx-route is-${selected.move.risk}`, weight: 4, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(layers.routes);
      const { to } = selected.move;
      L.marker([to.latitude, to.longitude], {
        icon: L.divIcon({ className: "mx-pin mx-pin-dest", html: `<span class="mx-pin-dest-ring" aria-hidden="true"></span>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
        keyboard: false,
        interactive: false
      }).addTo(layers.routes);
      const mid = line[Math.floor(line.length / 2)];
      L.marker(mid, {
        icon: L.divIcon({
          className: `mx-eta is-${selected.move.risk}`,
          html: `<span>${selected.move.etaMinutes} min</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        }),
        keyboard: false,
        interactive: false
      }).addTo(layers.routes);
    }
    if (showTraffic && truckRoute && truckRoute.points.length >= 2) {
      const line = truckRoute.points.map((point) => [point.latitude, point.longitude] as [number, number]);
      L.polyline(line, {
        className: `mx-route mx-route-truck is-${(truckRoute.trafficStatus ?? "Light").toLowerCase()}`,
        weight: 4,
        opacity: 1,
        dashArray: "2 10",
        lineCap: "round"
      }).addTo(layers.routes);
    }
  }, [route, selected, truckRoute, showTraffic, ready]);

  /* Framing: all the sites at first; the route when one is chosen. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: [number, number][] = [];
    if (route && route.length >= 2 && selected?.move) {
      for (const point of route) points.push([point.latitude, point.longitude]);
      if (selected.site) points.push([selected.site.latitude, selected.site.longitude]);
    } else {
      for (const site of placed) points.push([site.project.latitude, site.project.longitude]);
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 14, animate: ready });
  }, [placed, route, selected, ready]);

  return (
    <div className="mx-map-host">
      <div ref={hostRef} className="mx-map" role="presentation" />
      {!ready && (
        <div className="mx-map-fallback" aria-hidden="true">
          <span>The map draws once it has room.</span>
        </div>
      )}
      {/* The map, as a list: every site and machine on it, reachable by keyboard and by a
          screen reader (Leaflet's markers are decoration to both). The tests use it too. */}
      <ul className="mx-sr" aria-label="Map pins">
        {placed.map((site) => (
          <li key={site.project.id}>
            <button type="button" onClick={() => onSelectSite(site.project.id)} aria-pressed={site.project.id === selectedSiteId}>
              {site.project.name}, {site.jobCount} {site.jobCount === 1 ? "job" : "jobs"}
              {showWeather && site.weather !== "clear" ? `, weather ${site.weather}` : ""}
            </button>
            {site.machines.length > 0 && (
              <ul>
                {site.machines.map((machine) => (
                  <li key={machine.equipment.id}>
                    <button
                      type="button"
                      onClick={() => onSelectMachine(selected?.equipment.id === machine.equipment.id ? null : machine.equipment.id)}
                      aria-pressed={selected?.equipment.id === machine.equipment.id}
                    >
                      {machine.equipment.name} at {site.project.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
