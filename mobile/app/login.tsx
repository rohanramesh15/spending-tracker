import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { H1, Paragraph, Spinner, XStack, YStack } from "tamagui";

import { GoogleIcon } from "@/components/GoogleIcon";
import { Button } from "@/components/ui";
import { IS_SUPABASE_CONFIGURED } from "@/lib/env";
import { SignInCancelled, signInWithGoogle } from "@/lib/useAuth";

/**
 * Login (user-flow §1) — Google OAuth via Supabase.
 *
 * Native flow differs from web: rather than redirecting the page, this opens a system browser
 * sheet and exchanges the returned PKCE code for a session (see lib/useAuth.ts). Once the
 * session lands, useProtectedRoute in the root layout navigates away from here.
 */
export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPressGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // On success the root layout redirects; nothing to do here.
    } catch (err) {
      // Backing out of the browser sheet is a normal action, not a failure to report.
      if (!(err instanceof SignInCancelled)) {
        setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} justifyContent="center" paddingHorizontal="$6" gap="$6">
        <YStack gap="$2">
          <H1 size="$9">TrackIt</H1>
          <Paragraph theme="alt2">Sign in to continue.</Paragraph>
        </YStack>

        <YStack gap="$3">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!IS_SUPABASE_CONFIGURED}
            icon={<GoogleIcon size={18} />}
            onPress={onPressGoogle}
            accessibilityLabel="Continue with Google"
          >
            {busy ? "Signing in…" : "Continue with Google"}
          </Button>

          {!IS_SUPABASE_CONFIGURED && (
            <Paragraph color="$orange10" size="$3">
              Supabase isn&apos;t configured. Copy mobile/.env.example to mobile/.env.local, fill
              in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart
              the dev server.
            </Paragraph>
          )}

          {error && (
            <Paragraph color="$red10" size="$3">
              {error}
            </Paragraph>
          )}
        </YStack>
      </YStack>
    </SafeAreaView>
  );
}
