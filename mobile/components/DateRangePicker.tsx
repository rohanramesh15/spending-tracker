import { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { Paragraph, Separator, XStack, YStack } from "tamagui";

import { formatRangeLabel, parseISODate, rangePresets, toISODate } from "@shared/lib/dates";
import { AppSheet, Button, SheetRow } from "@/components/ui";

/**
 * "1 Aug 2026" rather than the raw "2026-08-01". The ISO string is the storage format, not a
 * thing to read — and a bare numeric date is ambiguous across locales besides.
 *
 * parseISODate, not `new Date(iso)`: purchased_on is a LOCAL calendar date, and UTC parsing
 * renders the previous day in behind-UTC timezones (CLAUDE.md #2).
 */
function formatDayLabel(iso: string): string {
  return format(parseISODate(iso), "d MMM yyyy");
}

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
      {/* Not chromeless: as bare text next to a large total it read as a caption rather than a
          control. It now carries the same filled treatment as the Add button so it is visibly
          tappable. */}
      <Button
        variant="secondary"
        size="sm"
        icon={<Feather name="calendar" size={14} />}
        onPress={() => setOpen(true)}
        accessibilityLabel="Change date range"
        testID="date-range-trigger"
      >
        {formatRangeLabel(value.start, value.end)}
      </Button>

      {/* No "Date range" heading: the sheet is opened from a button that already says what it
          is, so the title only repeated it and pushed the presets down. */}
      <AppSheet open={open} onOpenChange={setOpen} snapPoints={[60]}>
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
          <Button variant="secondary" fullWidth onPress={() => setCustomField("start")} testID="custom-start">
            From {formatDayLabel(value.start)}
          </Button>
          <Button variant="secondary" fullWidth onPress={() => setCustomField("end")} testID="custom-end">
            To {formatDayLabel(value.end)}
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
