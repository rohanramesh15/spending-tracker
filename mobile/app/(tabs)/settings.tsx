import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Image, Paragraph, Spinner, XStack, YStack } from "tamagui";

import * as DocumentPicker from "expo-document-picker";

import { useImportAppleCard, useLinkedAccounts, useSyncBank } from "@shared/api/hooks";
import type { AccountStatus } from "@shared/api/types";
import { accountActionLabel, usePlaidLinkFlow } from "@/components/PlaidLink";
import { avatarUrlFrom, displayNameFrom } from "@/lib/profile";
import { signOut, useAuth } from "@/lib/useAuth";
import { BLOCK_PADDING_X, BlockGroup, BlockGroupTitle, Button, Card, ConfirmDialog, ErrorState, ListSkeleton, PageHeader, Screen, useToast } from "@/components/ui";

/**
 * Settings — profile, connected accounts, data management and app info (user-flow §9).
 *
 * This is a bottom tab, not a pushed screen, so it has no back button. It doubles as the
 * profile page: the signed-in identity leads, because it is the thing you come here to check.
 *
 * Rows use the shared grouped-block geometry (components/ui/grouped.ts), the same one the
 * transaction list uses, so every list in the app reads as the same kind of surface.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const accounts = useLinkedAccounts();
  const sync = useSyncBank();
  const importCsv = useImportAppleCard();
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

  /**
   * Apple Card statement import (Phase 3). Goes through the SAME idempotent ingest endpoint as
   * receipts, manual entry and bank sync (CLAUDE.md #4), so an overlapping statement is matched
   * rather than double-counted — which is why the result is reported in three parts.
   */
  async function handleImport() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "public.comma-separated-values-text"],
      copyToCacheDirectory: true,
    });
    // Backing out of the picker is a normal action, not a failure.
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    try {
      const result = await importCsv.mutateAsync({
        uri: asset.uri,
        name: asset.name || "apple-card.csv",
        type: asset.mimeType || "text/csv",
      });
      const parts = [
        result.imported ? `${result.imported} added` : null,
        result.needs_review ? `${result.needs_review} to review` : null,
        result.duplicates ? `${result.duplicates} already imported` : null,
      ].filter(Boolean);
      toast.success(parts.length ? `Imported — ${parts.join(", ")}` : "Nothing new to import");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't import that file");
    }
  }

  const hasAccounts = (accounts.data?.length ?? 0) > 0;

  // Shared with Home's greeting — deriving the name twice is how two screens end up calling
  // the same person different things.
  const email = session?.user.email ?? undefined;
  const displayName = displayNameFrom(session);
  const avatarUrl = avatarUrlFrom(session);

  return (
    <Screen testID="settings-screen">
      <PageHeader title="Settings" />

      <YStack gap="$4">
        <ProfileBlock
          name={displayName}
          email={email}
          avatarUrl={avatarUrl}
        />

        <Section title="Connected accounts">
          {accounts.isLoading ? (
            <ListSkeleton rows={2} />
          ) : accounts.isError ? (
            <ErrorState message="Couldn't load connected accounts." onRetry={() => void accounts.refetch()} />
          ) : hasAccounts ? (
            <BlockGroup>
              {accounts.data!.map((account) => (
                <AccountRow
                  key={account.id}
                  institution={account.institution}
                  status={account.status}
                  busy={plaid.busy}
                  pending={plaid.openingAccountId === account.id}
                  onPress={() => void plaid.startUpdate(account.id)}
                />
              ))}
              <XStack paddingVertical="$3" paddingHorizontal={BLOCK_PADDING_X} gap="$2">
                <Button
                  variant="secondary"
                  fullWidth
                  loading={plaid.openingAccountId === "connect"}
                  disabled={plaid.busy}
                  onPress={() => void plaid.startConnect()}
                >
                  Connect another
                </Button>
                <Button
                  variant="ghost"
                  loading={sync.isPending}
                  disabled={plaid.busy}
                  onPress={() => void handleSync()}
                >
                  {sync.isPending ? "Syncing…" : "Sync now"}
                </Button>
              </XStack>
            </BlockGroup>
          ) : (
            <Card padding="$4" gap="$2" alignItems="center">
              <Paragraph fontWeight="600">No accounts connected</Paragraph>
              <Paragraph size="$2" theme="alt2" textAlign="center">
                Connect a bank to pull in transactions automatically. Receipts and manual entry work without it.
              </Paragraph>
              <Button
                variant="primary"
                loading={plaid.busy}
                onPress={() => void plaid.startConnect()}
              >
                Connect a bank
              </Button>
            </Card>
          )}
        </Section>

        <Section title="Apple Card">
          <BlockGroup>
            <SettingRow
              label={importCsv.isPending ? "Importing…" : "Import a statement CSV"}
              icon={<Feather name="upload" size={18} />}
              loading={importCsv.isPending}
              onPress={() => void handleImport()}
              testID="import-csv"
            />
          </BlockGroup>
          <Paragraph size="$2" theme="alt2" paddingHorizontal="$1" paddingTop="$2">
            Goes through the same ingest door as everything else, so re-importing an overlapping
            statement is matched rather than duplicated.
          </Paragraph>
        </Section>

        <Section title="About">
          <BlockGroup>
            <SettingRow
              label="Version"
              icon={<Feather name="info" size={18} />}
              value="1.0.0"
              testID="version"
            />
          </BlockGroup>
        </Section>

        {/* Last, and visually separated: signing out is the one destructive action here, so it
            sits below everything rather than among the things you came to read. */}
        <BlockGroup>
          <SettingRow
            label="Sign out"
            icon={<Feather name="log-out" size={18} color="#e34948" />}
            destructive
            onPress={() => setConfirmingSignOut(true)}
            testID="sign-out"
          />
        </BlockGroup>
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
  // Surface and corners belong to the enclosing BlockGroup; this renders content only.
  return (
    <XStack
      paddingVertical="$3"
      paddingHorizontal={BLOCK_PADDING_X}
      alignItems="center"
      justifyContent="space-between"
      gap="$3"
    >
      <YStack flex={1} gap="$1">
        <Paragraph fontWeight="600">{institution}</Paragraph>
        <Paragraph size="$2" theme="alt2">{statusLabel[status]}</Paragraph>
      </YStack>
      <Button variant="ghost" size="sm" loading={pending} disabled={busy} onPress={onPress}>
        {pending ? "Opening…" : accountActionLabel(status)}
      </Button>
    </XStack>
  );
}

/**
 * Profile header — the signed-in identity, in the same block surface as everything else.
 *
 * Settings doubles as the profile page, so who you are signed in as leads rather than sitting
 * in a caption. Falls back through Google's display name, then the email's local part, so the
 * block never renders nameless.
 */
function ProfileBlock({
  name,
  email,
  avatarUrl,
}: {
  name?: string;
  email?: string;
  avatarUrl?: string;
}) {
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase();

  return (
    // No block surface here, and no horizontal padding: the profile is the page's own header,
    // not an item in a list, so the avatar aligns with the page's left edge rather than being
    // inset inside a card like the rows below it.
    <XStack alignItems="center" gap="$3" paddingVertical="$2" testID="profile-block">
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} width={48} height={48} borderRadius={24} />
      ) : (
        <YStack
          width={48}
          height={48}
          borderRadius={24}
          backgroundColor="$color5"
          alignItems="center"
          justifyContent="center"
        >
          <Paragraph fontWeight="700" fontSize={20}>
            {initial}
          </Paragraph>
        </YStack>
      )}
      <YStack flex={1} gap="$1">
        <Paragraph fontWeight="700" fontSize={17} numberOfLines={1}>
          {name ?? "Signed in"}
        </Paragraph>
        <Paragraph size="$2" theme="alt2" numberOfLines={1}>
          {email ?? "—"}
        </Paragraph>
      </YStack>
    </XStack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack gap="$2">
      <BlockGroupTitle>{title}</BlockGroupTitle>
      {children}
    </YStack>
  );
}

/**
 * A row in a settings block.
 *
 * Interactive rows ARE buttons and go through the design system — same press feedback, same
 * disabled rule, same destructive treatment as everywhere else. `ghost` because the enclosing
 * BlockGroup already supplies the surface; the row would otherwise paint a second one on top.
 *
 * A row with no `onPress` is information, not a control (the version number). It renders as
 * plain text rather than a button that does nothing when tapped.
 */
function SettingRow({
  label,
  icon,
  value,
  destructive = false,
  onPress,
  loading = false,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
  loading?: boolean;
  testID?: string;
}) {
  if (!onPress) {
    return (
      <XStack
        paddingVertical="$3.5"
        paddingHorizontal={BLOCK_PADDING_X}
        justifyContent="space-between"
        alignItems="center"
        testID={testID}
      >
        <XStack alignItems="center" gap="$3">
          {icon}
          <Paragraph>{label}</Paragraph>
        </XStack>
        {value ? (
          <Paragraph size="$2" theme="alt2">
            {value}
          </Paragraph>
        ) : null}
      </XStack>
    );
  }

  return (
    <Button
      variant={destructive ? "destructive" : "ghost"}
      size="lg"
      fullWidth
      align="between"
      loading={loading}
      icon={icon}
      // Destructive actions are endpoints, not navigation — no chevron promising another screen.
      iconAfter={
        destructive ? undefined : <Feather name="chevron-right" size={18} color="#8a8a8e" />
      }
      onPress={onPress}
      testID={testID}
    >
      {label}
    </Button>
  );
}
