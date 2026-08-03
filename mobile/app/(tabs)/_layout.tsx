import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import { useTheme } from "tamagui";

/**
 * Bottom tab bar — mirrors the web AppShell's four tabs (user-flow §0).
 *
 * One deliberate difference from web: "Scan" is a real route here, not a hidden file input.
 * Native gets a proper camera screen (expo-camera, step 8) rather than the browser's capture
 * hack — one of the places the native app should simply be better.
 *
 * The web shell also renders unread-count badges on Home and Earn, driven by useReviews /
 * useNotifications. Those are intentionally NOT wired yet: the queries need an authenticated
 * session (step 3), and firing them unauthenticated just produces 401 noise. Add them with
 * the screens in steps 6/10.
 */
export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.color?.val,
        tabBarInactiveTintColor: theme.placeholderColor?.val,
        tabBarStyle: { backgroundColor: theme.background?.val },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Transactions",
          tabBarIcon: ({ color, size }) => <Feather name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => <Feather name="camera" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="earn"
        options={{
          title: "Earn",
          tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
