import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./lib/supabase"; // initializes the Supabase auth client + wires the JWT into the API client
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep last-known data visible during refetch (user-flow §10 loading rule).
      staleTime: 30_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
