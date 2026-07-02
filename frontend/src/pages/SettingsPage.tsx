import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/useAuth";

/**
 * Settings — connected accounts, categories, CSV import, export (user-flow §9).
 * Phase 1 stub: extraction-provider indicator + sign out. The rest lands in later phases.
 */
export default function SettingsPage() {
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="space-y-1 text-sm">
        <p className="font-medium">Extraction provider</p>
        <p className="text-muted-foreground">Gemini — free tier</p>
      </div>

      <Button variant="outline" onClick={handleSignOut}>
        Sign out
      </Button>
    </section>
  );
}
