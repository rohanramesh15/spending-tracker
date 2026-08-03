import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Button, H3, Paragraph, XStack, YStack } from "tamagui";

import { signOut } from "@/lib/useAuth";
import { Card, ConfirmDialog, Screen, useToast } from "@/components/ui";

/**
 * Settings — user account, data management, and app info (user-flow §9).
 *
 * Native-first: as a pushed screen on top of the current tab, keeping the tab bar visible.
 * This is a v1 with the essentials; Plaid account management comes later with the EAS dev build.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  async function handleSignOut() {
    try {
      await signOut();
      toast.success("Signed out");
      router.replace("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sign out");
    }
  }

  return (
    <Screen testID="settings-screen">
      <XStack alignItems="center" gap="$2">
        <Button size="$3" circular chromeless accessibilityLabel="Back" onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} />
        </Button>
        <H3 flex={1}>Settings</H3>
      </XStack>

      <YStack gap="$4">
        <Section title="Account">
          <Card flat padding="$0">
            <SettingRow
              label="Sign out"
              icon={<Feather name="log-out" size={18} color="#e34948" />}
              destructive
              onPress={() => setConfirmingSignOut(true)}
              testID="sign-out"
            />
          </Card>
        </Section>

        <Section title="Data">
          <Card flat padding="$0">
            <SettingRow
              label="Export CSV"
              icon={<Feather name="download" size={18} />}
              onPress={() => toast.success("CSV export coming soon")}
              testID="export-csv"
            />
            <SettingRow
              label="Import CSV"
              icon={<Feather name="upload" size={18} />}
              onPress={() => toast.success("CSV import coming soon")}
              testID="import-csv"
            />
          </Card>
        </Section>

        <Section title="About">
          <Card flat padding="$0">
            <SettingRow
              label="Version"
              icon={<Feather name="info" size={18} />}
              value="1.0.0"
              testID="version"
            />
          </Card>
        </Section>
      </YStack>

      <ConfirmDialog
        open={confirmingSignOut}
        onOpenChange={(open: boolean) => !open && setConfirmingSignOut(false)}
        title="Sign out?"
        description="You can sign back in anytime with Google."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => void handleSignOut()}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack gap="$2">
      <Paragraph fontWeight="600">{title}</Paragraph>
      {children}
    </YStack>
  );
}

function SettingRow({
  label,
  icon,
  value,
  destructive = false,
  onPress,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <XStack
      padding="$3"
      justifyContent="space-between"
      alignItems="center"
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      accessibilityRole={onPress ? "button" : undefined}
      testID={testID}
    >
      <XStack alignItems="center" gap="$3">
        {icon}
        <Paragraph fontWeight="500" color={destructive ? "$red10" : undefined}>
          {label}
        </Paragraph>
      </XStack>
      {value ? (
        <Paragraph size="$2" theme="alt2">
          {value}
        </Paragraph>
      ) : onPress ? (
        <Feather name="chevron-right" size={18} color="$gray10" />
      ) : null}
    </XStack>
  );
}