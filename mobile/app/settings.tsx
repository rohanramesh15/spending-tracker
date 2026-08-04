import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Button, H3, Paragraph, Separator, Spinner, XStack, YStack } from "tamagui";

import { useLinkedAccounts, useSyncBank } from "@shared/api/hooks";
import type { AccountStatus } from "@shared/api/types";
import { accountActionLabel, usePlaidLinkFlow } from "@/components/PlaidLink";
import { signOut, useAuth } from "@/lib/useAuth";
import { Card, ConfirmDialog, ErrorState, ListSkeleton, Screen, useToast } from "@/components/ui";

/**
 * Settings — user account, data management, and app info (user-flow §9).
 *
 * Native-first: as a pushed screen on top of the current tab, keeping the tab bar visible.
 * This is a v1 with the essentials; Plaid account management comes later with the EAS dev build.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const accounts = useLinkedAccounts();
  const sync = useSyncBank();
  const plaid = usePlaidLinkFlow({ onSuccess: toast.success, onError: toast.error });

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

  async function handleSync() {
    try {
      const result = await sync.mutateAsync();
      const needsAttention = result.accounts.filter((account) => account.needs_attention);
      if (needsAttention.length) {
        toast.error(`${needsAttention.map((account) => account.institution).join(", ")} need reconnecting`);
        return;
      }
      const changes = [
        result.added ? `${result.added} added` : null,
        result.needs_review ? `${result.needs_review} to review` : null,
      ].filter(Boolean);
      toast.success(changes.length ? `Synced — ${changes.join(", ")}` : "You're up to date");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    }
  }

  const hasAccounts = (accounts.data?.length ?? 0) > 0;

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
          <Card flat padding="$3">
            <Paragraph size="$2" theme="alt2">
              Signed in as {session?.user.email ?? "—"}
            </Paragraph>
          </Card>
        </Section>

        <Section title="Connected accounts">
          {accounts.isLoading ? (
            <ListSkeleton rows={2} />
          ) : accounts.isError ? (
            <ErrorState message="Couldn't load connected accounts." onRetry={() => void accounts.refetch()} />
          ) : hasAccounts ? (
            <Card flat padding="$0">
              {accounts.data!.map((account, index) => (
                <YStack key={account.id}>
                  {index > 0 ? <Separator /> : null}
                  <AccountRow
                    institution={account.institution}
                    status={account.status}
                    busy={plaid.busy}
                    pending={plaid.openingAccountId === account.id}
                    onPress={() => void plaid.startUpdate(account.id)}
                  />
                </YStack>
              ))}
              <Separator />
              <XStack padding="$3" gap="$2">
                <Button flex={1} onPress={() => void plaid.startConnect()} disabled={plaid.busy}>
                  {plaid.openingAccountId === "connect" ? <Spinner color="#ffffff" /> : "Connect another"}
                </Button>
                <Button chromeless onPress={() => void handleSync()} disabled={sync.isPending || plaid.busy}>
                  {sync.isPending ? "Syncing…" : "Sync now"}
                </Button>
              </XStack>
            </Card>
          ) : (
            <Card padding="$4" gap="$2" alignItems="center">
              <Paragraph fontWeight="600">No accounts connected</Paragraph>
              <Paragraph size="$2" theme="alt2" textAlign="center">
                Connect a bank to pull in transactions automatically. Receipts and manual entry work without it.
              </Paragraph>
              <Button onPress={() => void plaid.startConnect()} disabled={plaid.busy} marginTop="$1">
                {plaid.busy ? <Spinner color="#ffffff" /> : "Connect a bank"}
              </Button>
            </Card>
          )}
        </Section>

        <Section title="Sign out">
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

const statusLabel: Record<AccountStatus, string> = {
  active: "Syncing",
  needs_reauth: "Reconnect needed",
  disconnected: "Disconnected",
};

function AccountRow({
  institution,
  status,
  busy,
  pending,
  onPress,
}: {
  institution: string;
  status: AccountStatus;
  busy: boolean;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <XStack padding="$3" alignItems="center" justifyContent="space-between" gap="$3">
      <YStack flex={1} gap="$1">
        <Paragraph fontWeight="600">{institution}</Paragraph>
        <Paragraph size="$2" theme="alt2">{statusLabel[status]}</Paragraph>
      </YStack>
      <Button size="$2" chromeless onPress={onPress} disabled={busy}>
        {pending ? "Opening…" : accountActionLabel(status)}
      </Button>
    </XStack>
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
