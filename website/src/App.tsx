import { AccountsFlow } from "./components/AccountsFlow";
import { AppSnapshot } from "./components/AppSnapshot";
import { WaitlistForm } from "./components/WaitlistForm";

const POINTS = [
  {
    title: "Every account in one place",
    body: "Debit, credit, savings. Transactions sync automatically once you connect them.",
  },
  {
    title: "Spending over time",
    body: "Any date range, month over month. See what's growing before it becomes a habit.",
  },
  {
    title: "Categorized, not guessed at",
    body: "Scan a receipt and TrackIt itemizes it — so a grocery run isn't one number.",
  },
];

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 sm:px-8">
        <span className="text-[17px] font-semibold tracking-tighter">TrackIt</span>
        <a
          href="#waitlist"
          className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Join the waitlist
        </a>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pb-32 sm:pt-16">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <div className="animate-rise-in">
              <h1 className="text-[clamp(2.4rem,5.5vw,3.6rem)] font-semibold leading-[1.04] tracking-tighter">
                Connect every account.
                <br />
                <span className="text-ink-3">Track where it all goes.</span>
              </h1>

              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-2">
                Debit, credit, savings — all in one place. TrackIt sorts your spending into
                categories and shows you how it moves over time.
              </p>

              <div className="mt-8 max-w-md">
                <WaitlistForm />
              </div>
            </div>

            <div className="animate-rise-in" style={{ animationDelay: "150ms" }}>
              <AccountsFlow />
            </div>
          </div>
        </section>

        {/* ---------- The app itself ---------- */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <h2 className="text-[clamp(1.8rem,3.6vw,2.5rem)] font-semibold leading-tight tracking-tighter">
                  Where the money actually went
                </h2>
                <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-2">
                  One chart, every category, any date range. Tax gets its own slice. So does
                  anything still waiting on a receipt.
                </p>
              </div>

              <AppSnapshot />
            </div>
          </div>
        </section>

        {/* ---------- Points ---------- */}
        <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
            {POINTS.map((point) => (
              <div key={point.title} className="border-t border-ink pt-5">
                <h3 className="text-[17px] font-semibold tracking-tight">{point.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{point.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Waitlist ---------- */}
        <section
          id="waitlist"
          className="scroll-mt-8 border-t border-line bg-surface px-5 py-24 sm:px-8 sm:py-28"
        >
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-tight tracking-tighter">
              Get early access
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">
              TrackIt is in private build. One email when it opens.
            </p>
            <div className="mx-auto mt-8 max-w-md text-left">
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-5 py-8 text-[13px] text-ink-3 sm:px-8">
        <span className="font-semibold tracking-tighter text-ink">TrackIt</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
