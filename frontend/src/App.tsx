import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import HomePage from "./pages/HomePage";
import TransactionsPage from "./pages/TransactionsPage";
import InsightsPage from "./pages/InsightsPage";
import SettingsPage from "./pages/SettingsPage";

/**
 * Route table mirrors the four-section navigation shell in user-flow.md §0
 * (Home · Transactions · Insights · Settings). Auth-gating (magic-link login)
 * and the Scan flow are layered in during Phase 1 UI / Phase 2.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
