import "react-native-url-polyfill/auto";
import "react-native-reanimated";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider } from "tamagui";

import { configureApi } from "@shared/api/client";
import { useProtectedRoute } from "@/components/AuthGate";
import { useColorScheme } from "@/components/useColorScheme";
import { API_BASE_URL, AUTH_DEV_BYPASS } from "@/lib/env";
import { queryPersister, QUERY_CACHE_BUSTER, QUERY_CACHE_MAX_AGE } from "@/lib/queryPersistence";
import { useAuth } from "@/lib/useAuth";
import tamaguiConfig from "@/tamagui.config";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// The shared API client no longer reads import.meta (Metro has no import.meta), so the base
// URL is injected once at module load, before any request can fire. Mirrors main.tsx on web.
configureApi({ baseUrl: API_BASE_URL });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep last-known data visible during refetch (user-flow §10 loading rule).
      staleTime: 30_000,
      // Must be >= the persister's maxAge, or gc evicts data before a relaunch can use it.
      gcTime: QUERY_CACHE_MAX_AGE,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: QUERY_CACHE_MAX_AGE,
          buster: QUERY_CACHE_BUSTER,
        }}
      >
        <SafeAreaProvider>
          <StatusBar style="auto" />
          {/* useProtectedRoute must live INSIDE the providers (it reads the query client to
              wipe the cache on a user change) and inside the navigation tree (it redirects). */}
          <RootNavigator />
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </TamaguiProvider>
  );
}

/**
 * Session-aware navigator. Both route groups are always registered — useProtectedRoute
 * decides which one the user is allowed to be on, rather than the tree changing shape
 * underneath the router (which strands in-flight navigations).
 */
function RootNavigator() {
  const { session, loading } = useAuth();
  useProtectedRoute(session, loading, AUTH_DEV_BYPASS);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ animation: "fade" }} />
    </Stack>
  );
}
