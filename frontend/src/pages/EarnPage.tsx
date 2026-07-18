import { Link } from "react-router-dom";
import { Repeat, Landmark, CreditCard, Bot } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Save & Earn — the hub for money-saving/earning agents (docs/money-saving-agents.local.md).
 * Full-width, Spotify-search-style cards (~4 fit a phone viewport). Subscriptions is the
 * first shipped feature, so it's the top card; the rest are placeholders for the roadmap.
 */
interface Feature {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  bg: string;
  to?: string;
  available: boolean;
}

const FEATURES: Feature[] = [
  {
    title: "Subscriptions",
    subtitle: "Find & manage recurring charges",
    icon: Repeat,
    bg: "bg-violet-600",
    to: "/earn/subscriptions",
    available: true,
  },
  {
    title: "Fee & Interest Auditor",
    subtitle: "Spot avoidable bank fees & interest",
    icon: Landmark,
    bg: "bg-rose-500",
    available: false,
  },
  {
    title: "Card Rewards Optimizer",
    subtitle: "Use the right card for more cashback",
    icon: CreditCard,
    bg: "bg-emerald-600",
    available: false,
  },
  {
    title: "Spending Assistant",
    subtitle: "Ask where you can cut costs",
    icon: Bot,
    bg: "bg-amber-500",
    available: false,
  },
];

export default function EarnPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Save &amp; Earn</h1>
        <p className="text-sm text-muted-foreground">
          Agents that put money back in your pocket.
        </p>
      </div>

      <div className="space-y-3">
        {FEATURES.map((f) => (
          <FeatureCard key={f.title} feature={f} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  const card = (
    <div
      className={cn(
        "relative flex h-28 flex-col justify-center overflow-hidden rounded-xl p-4 text-white shadow-sm",
        feature.bg,
        feature.available ? "transition-transform active:scale-[0.98]" : "opacity-80",
      )}
    >
      <p className="text-lg font-bold leading-tight">{feature.title}</p>
      <p className="mt-0.5 max-w-[68%] text-sm text-white/85">{feature.subtitle}</p>
      {!feature.available && (
        <span className="absolute right-3 top-3 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          Soon
        </span>
      )}
      {/* Rotated corner glyph — the Spotify genre-card motif. */}
      <Icon
        className="absolute -bottom-3 -right-3 h-20 w-20 rotate-[25deg] text-white/25"
        strokeWidth={1.5}
        aria-hidden
      />
    </div>
  );

  return feature.available && feature.to ? (
    <Link to={feature.to} aria-label={feature.title}>
      {card}
    </Link>
  ) : (
    <div aria-disabled="true">{card}</div>
  );
}
