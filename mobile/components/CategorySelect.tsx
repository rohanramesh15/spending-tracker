import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { Paragraph, XStack, YStack } from "tamagui";

import { useCategories } from "@shared/api/hooks";
import { categoryColor, categoryLabel } from "@shared/lib/categories";
import { AppSheet, Button } from "@/components/ui";

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
        variant="secondary"
        fullWidth
        align="between"
        disabled={isLoading}
        icon={
          selected ? (
            <YStack
              width={12}
              height={12}
              borderRadius={3}
              backgroundColor={categoryColor(selected.name)}
            />
          ) : null
        }
        iconAfter={<Feather name="chevron-down" size={16} />}
        onPress={() => setOpen(true)}
        accessibilityLabel="Choose a category"
        testID={testID ?? "category-select"}
        // Addressable on its own: Tamagui's Sheet mounts the option list even while closed,
        // so a bare text query would match both the trigger and the hidden option.
        labelTestID="category-select-label"
      >
        {selected ? categoryLabel(selected.name) : isLoading ? "Loading…" : "Pick a category"}
      </Button>

      <AppSheet open={open} onOpenChange={setOpen}>
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
