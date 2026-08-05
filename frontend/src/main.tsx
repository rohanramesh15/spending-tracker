import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { configureApi } from "@shared/api/client";
import "./lib/supabase"; // initializes the Supabase auth client + wires the JWT into the API client
import { queryPersister, QUERY_CACHE_BUSTER, QUERY_CACHE_MAX_AGE } from "./lib/queryPersistence";
import "./index.css";

// The shared API client no longer reads import.meta.env directly (Metro/React Native has no
// import.meta), so each app injects its own base URL at startup. Empty string = same-origin,
// which is what local dev uses via the Vite /api proxy.
configureApi({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? "" });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep last-known data visible during refetch (user-flow §10 loading rule).
      staleTime: 30_000,
      // Must be >= the persister's maxAge, or gc evicts data before a reload can use it.
      gcTime: QUERY_CACHE_MAX_AGE,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: QUERY_CACHE_MAX_AGE,
        buster: QUERY_CACHE_BUSTER,
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
