import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { H2, Paragraph, YStack } from "tamagui";

import { Screen } from "@/components/ui";

/**
 * Save & Earn — the hub for money-saving agents.
 *
 * Shipped features link out; roadmap ones are visibly "Soon" rather than hidden, so the page
 * states its own intent. Keeps the web card motif (bold colour block, oversized corner glyph).
 */
interface Feature {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  background: string;
  href?: Href;
  available: boolean;
}

const FEATURES: Feature[] = [
  {
    title: "Subscriptions",
    subtitle: "Find & manage recurring charges",
    icon: "repeat",
    background: "#7c3aed",
    href: "/subscriptions",
    available: true,
  },
  {
    title: "Fee & Interest Auditor",
    subtitle: "Spot avoidable bank fees & interest",
    icon: "home",
    background: "#f43f5e",
    available: false,
  },
  {
    title: "Card Rewards Optimizer",
    subtitle: "Use the right card for more cashback",
    icon: "credit-card",
    background: "#059669",
    href: "/rewards",
    available: true,
  },
  {
    title: "Spending Assistant",
    subtitle: "Ask where you can cut costs",
    icon: "message-circle",
    background: "#f59e0b",
    available: false,
  },
];

export default function EarnScreen() {
  const router = useRouter();

  return (
    <Screen testID="earn-screen">
      <YStack gap="$1">
        <H2>Save &amp; Earn</H2>
        <Paragraph size="$2" theme="alt2">
          Agents that put money back in your pocket.
        </Paragraph>
      </YStack>

      <YStack gap="$3">
        {FEATURES.map((f) => (
          <FeatureCard
            key={f.title}
            feature={f}
            onPress={f.available && f.href ? () => router.push(f.href as Href) : undefined}
          />
        ))}
      </YStack>
    </Screen>
  );
}

function FeatureCard({ feature, onPress }: { feature: Feature; onPress?: () => void }) {
  return (
    <YStack
      height={112}
      borderRadius="$6"
      padding="$4"
      justifyContent="center"
      overflow="hidden"
      backgroundColor={feature.background}
      opacity={feature.available ? 1 : 0.8}
      pressStyle={onPress ? { scale: 0.98 } : undefined}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={feature.title}
      testID={`feature-${feature.title}`}
    >
      <Paragraph color="#ffffff" fontSize={18} fontWeight="700">
        {feature.title}
      </Paragraph>
      <Paragraph color="rgba(255,255,255,0.85)" size="$2" maxWidth="68%">
        {feature.subtitle}
      </Paragraph>

      {!feature.available ? (
        <YStack
          position="absolute"
          top="$3"
          right="$3"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$10"
          backgroundColor="rgba(0,0,0,0.25)"
        >
          <Paragraph color="#ffffff" fontSize={10} fontWeight="700">
            SOON
          </Paragraph>
        </YStack>
      ) : null}

      <YStack position="absolute" bottom={-12} right={-12} opacity={0.25}>
        <Feather name={feature.icon} size={80} color="#ffffff" />
      </YStack>
    </YStack>
  );
}
