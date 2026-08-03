import "react-native-url-polyfill/auto";
import "react-native-reanimated";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider } from "tamagui";

import { configureApi } from "@shared/api/client";
import { useColorScheme } from "@/components/useColorScheme";
import { API_BASE_URL } from "@/lib/env";
import { queryPersister, QUERY_CACHE_BUSTER, QUERY_CACHE_MAX_AGE } from "@/lib/queryPersistence";
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
          {/* Auth gating arrives in step 3; until then the tabs render unguarded. */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </TamaguiProvider>
  );
}
