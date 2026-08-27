import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import { useTheme } from "tamagui";

/**
 * Bottom tab bar — Home, Transactions, Earn, Settings.
 *
 * Scan is deliberately NOT a tab. It isn't a place you go, it's one of three ways to add a
 * transaction, so it lives behind Transactions → Add alongside manual entry and the photo
 * library. A tab implied it was a destination and pushed the other two ways of adding a
 * transaction out of sight. The route still exists at /scan, entered with a `source` param.
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
        name="earn"
        options={{
          title: "Earn",
          tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
