import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { Button, Paragraph, XStack, YStack } from "tamagui";

import { useCategories } from "@shared/api/hooks";
import { categoryColor, categoryLabel } from "@shared/lib/categories";
import { AppSheet } from "@/components/ui";

/**
 * Category picker. Native-first: web used a dropdown; a phone gets a bottom sheet list.
 *
 * The taxonomy is FIXED and seeded server-side (CLAUDE.md #9) — this only ever offers what the
 * API returns and never lets the user invent a category.
 */
export function CategorySelect({
  value,
  onChange,
  testID,
}: {
  value: string | null;
  onChange: (id: string) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: categories, isLoading } = useCategories();

  const selected = categories?.find((c) => c.id === value);

  return (
    <>
      <Button
        size="$3"
        onPress={() => setOpen(true)}
        disabled={isLoading}
        testID={testID ?? "category-select"}
        accessibilityLabel="Choose a category"
      >
        <XStack alignItems="center" gap="$2" flex={1}>
          {selected ? (
            <YStack
              width={12}
              height={12}
              borderRadius={3}
              backgroundColor={categoryColor(selected.name)}
            />
          ) : null}
          <Paragraph flex={1} size="$3" theme={selected ? undefined : "alt2"}>
            {selected ? categoryLabel(selected.name) : isLoading ? "Loading…" : "Pick a category"}
          </Paragraph>
          <Feather name="chevron-down" size={16} />
        </XStack>
      </Button>

      <AppSheet open={open} onOpenChange={setOpen} snapPoints={[65]}>
        <Paragraph fontWeight="700" size="$5">
          Category
        </Paragraph>
        <YStack>
          {(categories ?? []).map((c) => (
            <XStack
              key={c.id}
              alignItems="center"
              gap="$3"
              paddingVertical="$3"
              pressStyle={{ opacity: 0.6 }}
              accessibilityRole="button"
              testID={`category-option-${c.name}`}
              onPress={() => {
                onChange(c.id);
                setOpen(false);
              }}
            >
              <YStack width={14} height={14} borderRadius={3} backgroundColor={categoryColor(c.name)} />
              <Paragraph flex={1}>{categoryLabel(c.name)}</Paragraph>
              {c.id === value ? <Feather name="check" size={16} /> : null}
            </XStack>
          ))}
        </YStack>
      </AppSheet>
    </>
  );
}
