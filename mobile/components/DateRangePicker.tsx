import { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { Button, Paragraph, Separator, XStack, YStack } from "tamagui";

import { formatRangeLabel, parseISODate, rangePresets, toISODate } from "@shared/lib/dates";
import { AppSheet, SheetRow } from "@/components/ui";

export interface DateRangeValue {
  start: string;
  end: string;
}

/**
 * Date range control (user-flow §8a — single day is first-class).
 *
 * Native-first: web used a popover with an inline two-month calendar, which doesn't fit a phone.
 * Here the presets are a bottom sheet, and a custom range uses the platform date picker.
 *
 * The preset list comes from shared/lib/dates so both clients offer the same ranges, and all
 * dates stay local calendar dates — never converted through UTC (CLAUDE.md #2).
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customField, setCustomField] = useState<"start" | "end" | null>(null);
  const presets = rangePresets();

  function choosePreset(start: string, end: string) {
    onChange({ start, end });
    setOpen(false);
  }

  function onPickDate(field: "start" | "end", picked?: Date) {
    setCustomField(null);
    if (!picked) return;

    const iso = toISODate(picked);
    // Keep the range coherent: choosing a start after the current end (or an end before the
    // current start) would otherwise produce an inverted range the backend reads as empty.
    if (field === "start") {
      onChange({ start: iso, end: iso > value.end ? iso : value.end });
    } else {
      onChange({ start: iso < value.start ? iso : value.start, end: iso });
    }
  }

  return (
    <>
      <Button
        size="$3"
        chromeless
        onPress={() => setOpen(true)}
        accessibilityLabel="Change date range"
        testID="date-range-trigger"
      >
        <XStack alignItems="center" gap="$2">
          <Feather name="calendar" size={14} />
          <Paragraph size="$2">{formatRangeLabel(value.start, value.end)}</Paragraph>
        </XStack>
      </Button>

      <AppSheet open={open} onOpenChange={setOpen} snapPoints={[60]}>
        <Paragraph fontWeight="700" size="$5">
          Date range
        </Paragraph>

        <YStack>
          {presets.map((p) => (
            <SheetRow
              key={p.label}
              label={p.label}
              testID={`preset-${p.label}`}
              onPress={() => choosePreset(p.start, p.end)}
            />
          ))}
        </YStack>

        <Separator />

        <Paragraph theme="alt2" size="$2">
          Custom
        </Paragraph>
        <XStack gap="$3">
          <Button flex={1} size="$3" onPress={() => setCustomField("start")} testID="custom-start">
            From {value.start}
          </Button>
          <Button flex={1} size="$3" onPress={() => setCustomField("end")} testID="custom-end">
            To {value.end}
          </Button>
        </XStack>

        {customField ? (
          <DateTimePicker
            value={parseISODate(customField === "start" ? value.start : value.end)}
            mode="date"
            onChange={(_event, picked) => onPickDate(customField, picked)}
          />
        ) : null}
      </AppSheet>
    </>
  );
}
