import { useEffect } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from "@vis.gl/react-google-maps";
import type { FinderStore } from "@/api/types";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** The search-radius circle, drawn imperatively (react-google-maps has no Circle). */
function RadiusCircle({
  center,
  radiusMiles,
}: {
  center: { lat: number; lng: number };
  radiusMiles: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const circle = new google.maps.Circle({
      map,
      center,
      radius: radiusMiles * 1609.34,
      strokeColor: "#2563eb",
      strokeOpacity: 0.5,
      strokeWeight: 1,
      fillColor: "#2563eb",
      fillOpacity: 0.06,
      clickable: false,
    });
    map.fitBounds(circle.getBounds()!);
    return () => circle.setMap(null);
  }, [map, center.lat, center.lng, radiusMiles]);
  return null;
}

/**
 * Finder map (user-flow §8c): your location + radius circle, Kroger-family stores pinned
 * blue (we have prices), other grocery stores gray (no price data). Renders only when a
 * Maps key is configured; otherwise the finder falls back to the list alone.
 */
export function FinderMap({
  center,
  radiusMiles,
  stores,
}: {
  center: { lat: number; lng: number };
  radiusMiles: number;
  stores: FinderStore[];
}) {
  if (!MAPS_KEY) return null;
  const pins = stores.filter((s) => s.lat != null && s.lng != null);

  return (
    <div className="h-64 overflow-hidden rounded-xl border">
      <APIProvider apiKey={MAPS_KEY}>
        <Map
          defaultCenter={center}
          defaultZoom={12}
          mapId="DEMO_MAP_ID"
          gestureHandling="greedy"
          disableDefaultUI
          className="h-full w-full"
        >
          <RadiusCircle center={center} radiusMiles={radiusMiles} />
          <AdvancedMarker position={center} title="You">
            <div className="h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow" />
          </AdvancedMarker>
          {pins.map((s, i) => (
            <AdvancedMarker
              key={`${s.name}-${i}`}
              position={{ lat: s.lat!, lng: s.lng! }}
              title={s.name ?? undefined}
            >
              <Pin
                background={s.has_prices ? "#2563eb" : "#9ca3af"}
                borderColor={s.has_prices ? "#1e40af" : "#6b7280"}
                glyphColor="#ffffff"
              />
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}

export const MAPS_CONFIGURED = !!MAPS_KEY;
