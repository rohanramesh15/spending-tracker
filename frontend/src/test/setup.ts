import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver, which Recharts' ResponsiveContainer requires. Stub it so
// chart components (e.g. SubscriptionInsights) can render under test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as never);
