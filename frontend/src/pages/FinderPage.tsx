import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MapPin, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FinderMap, MAPS_CONFIGURED } from "@/components/FinderMap";
import { useFinder } from "@/api/hooks";
import type { FinderProduct, Tightness } from "@/api/types";
import { cn, formatCents } from "@/lib/utils";

const TIGHTNESS: Tightness[] = ["strict", "medium", "loose"];

/**
 * Cheaper-store finder (user-flow §8c). Prompts for the browser location, lets you set a
 * radius (1–25 mi) and substitution tightness, and shows the per-unit-cheapest options at
 * the nearest Kroger plus a map of nearby stores. Reached from a recurring item's "Find it
 * cheaper" or by typing an item.
 */
export default function FinderPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const category = params.get("category");

  const [item, setItem] = useState(params.get("item") ?? "");
  const [query, setQuery] = useState(item);
  const [radius, setRadius] = useState(5);
  const [tightness, setTightness] = useState<Tightness>("strict");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  function requestLocation() {
    if (!navigator.geolocation) {
      setGeoError("Your browser can't share a location.");
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () =>
        setGeoError("Location blocked — allow it in your browser to find nearby stores."),
      { timeout: 10_000 },
    );
  }

  useEffect(() => {
    requestLocation();
  }, []);

  const finder = useFinder({
    item,
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
    radius,
    tightness,
    category,
  });
  const data = finder.data;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Find it cheaper</h1>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setItem(query.trim());
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any item… (e.g. 2% milk)"
        />
        <Button type="submit" size="icon" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {/* Controls: tightness + radius */}
      <div className="space-y-3">
        <div className="inline-flex rounded-lg border p-1 text-sm">
          {TIGHTNESS.map((t) => (
            <button
              key={t}
              onClick={() => setTightness(t)}
              className={cn(
                "rounded-md px-3 py-1 capitalize",
                tightness === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Radius</span>
          <input
            type="range"
            min={1}
            max={25}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="w-12 text-right font-medium">{radius} mi</span>
        </div>
      </div>

      {!item ? (
        <Empty>Search for an item to compare prices near you.</Empty>
      ) : !loc ? (
        <div className="rounded-xl border bg-muted/30 p-6 text-center">
          <MapPin className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {geoError ?? "Getting your location…"}
          </p>
          {geoError && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={requestLocation}
            >
              Use my location
            </Button>
          )}
        </div>
      ) : finder.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking prices near you…</p>
      ) : finder.isError || !data ? (
        <Empty>Couldn't check prices right now.</Empty>
      ) : !data.kroger_configured ? (
        <Empty>Price lookup isn't configured yet.</Empty>
      ) : (
        <div className="space-y-4">
          {MAPS_CONFIGURED && (
            <FinderMap center={loc} radiusMiles={radius} stores={data.nearby_stores} />
          )}

          {data.results.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                {data.searched_store?.name} · as of{" "}
                {new Date(data.as_of).toLocaleTimeString()}
              </p>
              <ul className="divide-y rounded-xl border">
                {data.results.map((p, i) => (
                  <ProductRow
                    key={`${p.title}-${i}`}
                    product={p}
                    baseUnit={data.base_unit}
                    best={i === 0}
                  />
                ))}
              </ul>
            </>
          ) : (
            <Empty>
              No live prices within {radius} mi — widen the radius, or try a broader
              tightness.
            </Empty>
          )}

          {data.places_configured ? (
            <p className="text-xs text-muted-foreground">
              {data.nearby_stores.filter((s) => !s.has_prices).length} other nearby stores
              shown on the map (no price data).
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ProductRow({
  product,
  baseUnit,
  best,
}: {
  product: FinderProduct;
  baseUnit: string;
  best: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3",
        best && "bg-primary/5",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{product.title}</p>
        <p className="text-xs text-muted-foreground">
          {product.unit_price_cents != null
            ? `${formatCents(product.unit_price_cents)}/${baseUnit}`
            : "size n/a"}
        </p>
      </div>
      <div className="flex items-center gap-2 text-right">
        {best && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Best
          </span>
        )}
        <span className="font-medium">{formatCents(product.price_cents)}</span>
      </div>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      <Store className="h-5 w-5" />
      {children}
    </div>
  );
}
