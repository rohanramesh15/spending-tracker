import { categoryColor } from "../lib/categories";

/**
 * The value proposition as a picture: three separate accounts feed into one
 * timeline of spending. Accounts converge (the SVG funnel), then the months
 * stack up underneath in the app's category colors.
 *
 * Decorative — the prose beside it carries the same meaning for screen readers.
 */

const ACCOUNTS = [
  { label: "Debit", tail: "4417" },
  { label: "Credit", tail: "9082" },
  { label: "Savings", tail: "2310" },
];

const STACK = [
  "Food and Drinks",
  "Shopping",
  "Travel/Transportation",
  "Services",
  "Entertainment",
] as const;

/** Six months of spending, split across the stacked categories. Values are dollars. */
const MONTHS = [
  { label: "Nov", parts: [389, 210, 142, 118, 62] },
  { label: "Dec", parts: [452, 384, 176, 121, 96] },
  { label: "Jan", parts: [368, 172, 128, 115, 54] },
  { label: "Feb", parts: [401, 226, 154, 120, 71] },
  { label: "Mar", parts: [377, 198, 209, 124, 83] },
  { label: "Apr", parts: [413, 286, 198, 164, 78] },
];

const MAX = Math.max(...MONTHS.map((month) => month.parts.reduce((a, b) => a + b, 0)));
const CHART_HEIGHT = 168;

export function AccountsFlow() {
  return (
    <div aria-hidden="true" className="select-none">
      {/* --- Accounts --- */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {ACCOUNTS.map((account, i) => (
          <div
            key={account.label}
            className="animate-rise-in rounded-xl border border-line bg-surface px-3 py-2.5 text-center"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <p className="text-[12px] font-medium text-ink sm:text-[13px]">{account.label}</p>
            <p className="mt-0.5 font-mono text-[10px] text-ink-3">···· {account.tail}</p>
          </div>
        ))}
      </div>

      {/* --- Funnel: three accounts into one stream --- */}
      <svg viewBox="0 0 300 44" className="h-10 w-full" preserveAspectRatio="none">
        {[50, 150, 250].map((x, i) => (
          <path
            key={x}
            d={`M ${x} 0 C ${x} 26, 150 18, 150 44`}
            fill="none"
            stroke="#D8D6D1"
            strokeWidth="1.5"
            strokeDasharray="200"
            className="animate-draw-line"
            style={{ ["--dash" as string]: "200px", animationDelay: `${300 + i * 110}ms` }}
          />
        ))}
      </svg>

      {/* --- One timeline --- */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.45)] sm:p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-medium text-ink">Spending over time</p>
          <p className="font-mono text-[11px] text-ink-3">6 months</p>
        </div>

        <div
          className="mt-4 flex items-end justify-between gap-1.5 sm:gap-3"
          style={{ height: CHART_HEIGHT }}
        >
          {MONTHS.map((month, monthIndex) => {
            const total = month.parts.reduce((a, b) => a + b, 0);
            return (
              <div key={month.label} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className="animate-grow-bar flex w-full origin-bottom flex-col-reverse overflow-hidden rounded-[4px]"
                  style={{
                    height: `${(total / MAX) * 100}%`,
                    animationDelay: `${600 + monthIndex * 80}ms`,
                  }}
                >
                  {month.parts.map((part, partIndex) => (
                    <div
                      key={STACK[partIndex]}
                      style={{
                        height: `${(part / total) * 100}%`,
                        backgroundColor: categoryColor(STACK[partIndex]),
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex justify-between gap-1.5 sm:gap-3">
          {MONTHS.map((month) => (
            <span key={month.label} className="flex-1 text-center text-[10px] text-ink-3">
              {month.label}
            </span>
          ))}
        </div>

        {/* Without this the stacked bands are just colors. */}
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3">
          {STACK.map((category) => (
            <li key={category} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: categoryColor(category) }}
              />
              <span className="text-[10px] text-ink-3">{category.split("/")[0]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
