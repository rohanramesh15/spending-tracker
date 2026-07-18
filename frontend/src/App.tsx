import { Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { AppShell } from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import TransactionsPage from "./pages/TransactionsPage";
import TransactionDetailPage from "./pages/TransactionDetailPage";
import ManualEntryPage from "./pages/ManualEntryPage";
import ScanPage from "./pages/ScanPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";
import RewardsPage from "./pages/RewardsPage";
import EarnPage from "./pages/EarnPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import SettingsPage from "./pages/SettingsPage";

/**
 * Routes mirror the navigation shell (user-flow §0). Everything but /login is
 * auth-gated; an expired session bounces to /login preserving the destination.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGate />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/:id" element={<TransactionDetailPage />} />
          <Route path="/add" element={<ManualEntryPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/earn" element={<EarnPage />} />
          <Route path="/earn/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/earn/rewards" element={<RewardsPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
