import { Link } from "react-router-dom";
import { Sparkles, CreditCard, TrendingUp, Info } from "lucide-react";
import { toast } from "sonner";
import {
  useCards,
  useRewardProfiles,
  useRewardsOptimization,
  useSetCardProfile,
} from "@/api/hooks";
import type { Card, RewardRecommendation } from "@/api/types";
import { formatCents } from "@/lib/utils";

/** Reward-category → display label (mirrors backend REWARD_CATEGORIES). */
const CATEGORY_LABELS: Record<string, string> = {
  groceries: "Groceries",
  dining: "Dining",
  gas: "Gas",
  travel: "Travel",
  transit: "Transit",
  streaming: "Streaming",
  drugstore: "Drugstore",
  online_retail: "Online retail",
  wholesale_club: "Wholesale club",
  other: "Other",
};

const catLabel = (c: string) => CATEGORY_LABELS[c] ?? c;
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;
const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

/**
 * Rewards optimizer (rewards-optimizer-plan §3, v1). Shows the best card to use per spending
 * category among the cards the user holds, and prompts them to confirm any card we couldn't
 * match automatically. v1 is advice-only — the "you lost $X vs the card you used" figure is v2.
 */
export default function RewardsPage() {
  const opt = useRewardsOptimization(90);
  const cards = useCards();
  const profiles = useRewardProfiles();
  const setProfile = useSetCardProfile();

  async function confirmCard(cardId: string, key: string) {
    if (!key) return;
    try {
      await setProfile.mutateAsync({ cardId, rewardProfileKey: key });
      toast.success("Card confirmed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    }
  }

  if (opt.isLoading) {
    return (
      <section className="space-y-4">
        <Header />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </section>
    );
  }

  if (opt.isError) {
    return (
      <section className="space-y-4">
        <Header />
        <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          Couldn't load your rewards. Try again in a moment.
        </p>
      </section>
    );
  }

  const data = opt.data!;
  const allCards = cards.data ?? [];
  const unmatched = allCards.filter((c) => c.needs_confirmation);
  const hasWallet = allCards.some((c) => c.reward_profile_key);

  return (
    <section className="space-y-5">
      <Header />

      {allCards.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {data.top_move && (
            <div className="flex items-start gap-3 rounded-xl border bg-primary/5 p-4">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Top move</p>
                <p className="text-sm text-muted-foreground">{data.top_move}</p>
              </div>
            </div>
          )}

          {hasWallet &&
            data.recommendations.length > 0 &&
            (data.total_missed_annual_cents != null && data.total_missed_annual_cents > 0 ? (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
                <p className="text-sm text-muted-foreground">
                  Rewards you left on the table (last {data.window_days} days, annualized)
                </p>
                <p className="mt-1 text-2xl font-semibold text-warning">
                  {dollars(data.total_missed_annual_cents)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    /yr by not using your best card
                  </span>
                </p>
              </div>
            ) : (
              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">
                  Best card per category, based on your last {data.window_days} days of spending
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {dollars(data.total_est_annual_reward_cents)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    /yr in rewards if you always use the best card
                  </span>
                </p>
              </div>
            ))}

          {unmatched.length > 0 && (
            <ConfirmCards
              cards={unmatched}
              profileOptions={(profiles.data ?? []).map((p) => ({
                key: p.key,
                label: `${p.display_name}${p.verified ? "" : " (unverified rates)"}`,
              }))}
              onConfirm={confirmCard}
              saving={setProfile.isPending}
            />
          )}

          {data.recommendations.length > 0 ? (
            <Recommendations recos={data.recommendations} />
          ) : hasWallet ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              No categorized card spending in the last {data.window_days} days yet — sync a card or
              check back after some purchases.
            </p>
          ) : null}

          <YourCards cards={allCards} />

          <Caveats points={data.points_assumption_note} scope={data.spend_scope_note} />
        </>
      )}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Sparkles className="h-5 w-5 text-primary" />
      <h1 className="text-xl font-semibold">Rewards</h1>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">No cards yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect a bank or card to see which of your cards earns the most in each category.
      </p>
      <Link
        to="/settings"
        className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Connect an account
      </Link>
    </div>
  );
}

function Recommendations({ recos }: { recos: RewardRecommendation[] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 font-medium">Best card</th>
            <th className="px-4 py-2 text-right font-medium">Rate</th>
            <th className="px-4 py-2 text-right font-medium">Est. /yr</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {recos.map((r) => (
            <tr key={r.reward_category}>
              <td className="px-4 py-3">
                <div className="font-medium">{catLabel(r.reward_category)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatCents(r.spend_cents)} spent
                </div>
                {r.est_annual_missed_cents != null && r.est_annual_missed_cents > 0 && (
                  <div className="text-xs text-warning">
                    on {r.current_card_name ?? "another card"} · missing{" "}
                    {dollars(r.est_annual_missed_cents)}/yr
                  </div>
                )}
              </td>
              <td className="px-4 py-3">{r.best_card_name}</td>
              <td className="px-4 py-3 text-right font-medium tabular-nums">{pct(r.best_rate)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {dollars(r.est_annual_reward_cents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmCards({
  cards,
  profileOptions,
  onConfirm,
  saving,
}: {
  cards: Card[];
  profileOptions: { key: string; label: string }[];
  onConfirm: (cardId: string, key: string) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-warning" />
        <p className="text-sm font-medium">
          Confirm {cards.length} card{cards.length > 1 ? "s" : ""}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        We couldn't match these to a reward profile. Pick the right one so the advice is accurate.
      </p>
      {cards.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {c.name ?? "Card"}
            {c.mask ? ` ••${c.mask}` : ""}{" "}
            <span className="text-muted-foreground">({c.institution})</span>
          </span>
          <select
            aria-label={`Reward profile for ${c.name ?? "card"}`}
            defaultValue=""
            disabled={saving}
            onChange={(e) => onConfirm(c.id, e.target.value)}
            className="max-w-[55%] rounded-lg border bg-background px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Choose card…
            </option>
            {profileOptions.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function YourCards({ cards }: { cards: Card[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Your cards</h2>
      <ul className="divide-y rounded-xl border">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="min-w-0 truncate">
              {c.name ?? "Card"}
              {c.mask ? ` ••${c.mask}` : ""}{" "}
              <span className="text-muted-foreground">({c.institution})</span>
            </span>
            <span className="shrink-0 text-muted-foreground">
              {c.reward_profile_name ??
                (c.needs_confirmation ? "Needs confirmation" : "No rewards")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Caveats({ points, scope }: { points: string; scope: string }) {
  return (
    <div className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
      <p>{scope}</p>
      <p>{points}</p>
    </div>
  );
}
