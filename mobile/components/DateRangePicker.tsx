import { useEffect, useRef, useState } from "react";
import { Animated, useWindowDimensions } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { Paragraph, XStack, YStack } from "tamagui";

import { formatRangeLabel, parseISODate, rangePresets, toISODate } from "@shared/lib/dates";
import { AppSheet, Button, SHEET_PADDING_X, SheetList, SheetRow } from "@/components/ui";

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

/**
 * A range in the same day-first form as the fields beside it, with the repeated parts collapsed:
 * "1 – 31 Aug 2026" rather than "1 Aug 2026 – 31 Aug 2026".
 *
 * Deliberately NOT the shared `formatRangeLabel` used on the trigger — that one is month-first
 * ("Aug 1–31, 2026"). Inside this sheet every date reads day-first, so the rows agree with each
 * other.
 */
function formatDayRange(start: string, end: string): string {
  if (start === end) return formatDayLabel(start);
  const s = parseISODate(start);
  const e = parseISODate(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameYear && s.getMonth() === e.getMonth()) {
    return `${format(s, "d")} – ${format(e, "d MMM yyyy")}`;
  }
  if (sameYear) return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
  return `${formatDayLabel(start)} – ${formatDayLabel(end)}`;
}

export interface DateRangeValue {
  start: string;
  end: string;
}

/**
 * Date range control (user-flow §8a — single day is first-class).
 *
 * Native-first: web used a popover with an inline two-month calendar, which doesn't fit a phone.
 * Here the presets are a bottom sheet.
 *
 * The sheet has two panels. Presets are the common case and lead; "Custom" is a row like any
 * other, and choosing it slides in a second panel for From and To. The pickers are NOT on the
 * first panel: they doubled its height for a path most people never take, and sat two date
 * spinners next to a list of one-tap answers.
 *
 * The preset list comes from shared/lib/dates so both clients offer the same ranges, and all
 * dates stay local calendar dates — never converted through UTC (CLAUDE.md #2).
 */
export function DateRangePicker({
  value,
  onChange,
  height = 38,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** Trigger height, for lining the control up with whatever it sits beside. */
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"presets" | "custom">("presets");
  /** Which field the custom panel's picker is currently driving. */
  const [editing, setEditing] = useState<"start" | "end">("start");
  /**
   * The custom range being assembled. Held locally rather than committed field by field:
   * writing a half-chosen range straight to `onChange` refetches the screen behind the sheet
   * against a range the user hasn't finished describing.
   */
  const [draft, setDraft] = useState<DateRangeValue>(value);

  const presets = rangePresets();
  // Only label Custom when the current range actually IS custom. Echoing a preset's dates beside
  // Custom implied a custom range had been chosen when the user had just tapped "This month".
  const matchesPreset = presets.some((p) => p.start === value.start && p.end === value.end);
  const { width } = useWindowDimensions();
  // The panels live inside the sheet's padding, so they are the CONTENT width — using the full
  // window width would push panel 2 past its own left inset and misalign every label on it.
  const panelWidth = width - SHEET_PADDING_X * 2;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: panel === "custom" ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [panel, slide]);

  function openSheet() {
    setDraft(value);
    setPanel("presets");
    setEditing("start");
    setOpen(true);
  }

  function choosePreset(start: string, end: string) {
    onChange({ start, end });
    setOpen(false);
  }

  function openCustom() {
    setDraft(value);
    setEditing("start");
    setPanel("custom");
  }

  /**
   * Collect From, then To, then commit and return to the presets list.
   *
   * The range is kept coherent as it is built: a start after the current end (or an end before
   * the current start) would otherwise produce an inverted range the backend reads as empty.
   */
  function onPickDate(picked?: Date) {
    if (!picked) return;
    const iso = toISODate(picked);

    if (editing === "start") {
      setDraft((d) => ({ start: iso, end: iso > d.end ? iso : d.end }));
      setEditing("end");
      return;
    }

    const next = { start: iso < draft.start ? iso : draft.start, end: iso };
    setDraft(next);
    onChange(next);
    setPanel("presets");
  }

  const panelShift = slide.interpolate({ inputRange: [0, 1], outputRange: [0, -panelWidth] });

  return (
    <>
      {/* Not chromeless: as bare text next to a large total it read as a caption rather than a
          control. It carries the same filled treatment as the Add button so it is visibly
          tappable. */}
      <Button
        variant="secondary"
        size="sm"
        // Sized by the caller to match whatever it stands beside — Home hands it the full height
        // of the label + amount stack, so the trigger squares off that block rather than sitting
        // at some button-scale height of its own.
        height={height}
        icon={<Feather name="calendar" size={14} />}
        onPress={openSheet}
        accessibilityLabel="Change date range"
        testID="date-range-trigger"
      >
        {/* No year: the trigger is a compact control and nothing else on Home states one. A range
            crossing a year boundary still shows both — see formatRangeLabel. */}
        {formatRangeLabel(value.start, value.end, { withYear: false })}
      </Button>

      <AppSheet
        open={open}
        onOpenChange={setOpen}
        // The title tracks the visible panel, and the back button lives in the sheet header
        // rather than inside the sliding panel — an accessory that slides away with its content
        // is unreachable for the duration of the animation.
        title={panel === "presets" ? "Select date range" : "Custom range"}
        left={
          panel === "custom" ? (
            <Button
              variant="ghost"
              circular
              size="sm"
              icon={<Feather name="chevron-left" size={18} />}
              accessibilityLabel="Back to presets"
              testID="custom-back"
              onPress={() => setPanel("presets")}
            />
          ) : undefined
        }
      >
        <YStack overflow="hidden">
          <Animated.View
            style={{ flexDirection: "row", transform: [{ translateX: panelShift }] }}
          >
            {/* Panel 1 — presets, with Custom as a row like any other. */}
            <YStack width={panelWidth}>
              <SheetList>
                {presets.map((p) => (
                  <SheetRow
                    key={p.label}
                    label={p.label}
                    value={formatDayRange(p.start, p.end)}
                    testID={`preset-${p.label}`}
                    onPress={() => choosePreset(p.start, p.end)}
                  />
                ))}
                <SheetRow
                  label="Custom"
                  // States the range only when one has been set here, so the row gives the
                  // answer rather than only offering to ask the question.
                  value={matchesPreset ? undefined : formatDayRange(value.start, value.end)}
                  icon={<Feather name="sliders" size={18} />}
                  testID="preset-Custom"
                  onPress={openCustom}
                />
              </SheetList>
            </YStack>

            {/* Panel 2 — From, then To. */}
            <YStack width={panelWidth} gap="$2" testID="custom-panel">
              <FieldHeading
                label="From"
                date={draft.start}
                active={editing === "start"}
                onPress={() => setEditing("start")}
                testID="custom-from"
              />
              <FieldHeading
                label="To"
                date={draft.end}
                active={editing === "end"}
                onPress={() => setEditing("end")}
                testID="custom-to"
              />

              {/* One picker, driven by whichever field is active — two spinners side by side
                  don't fit a phone, and only one can be answered at a time anyway. */}
              {panel === "custom" ? (
                <DateTimePicker
                  value={parseISODate(editing === "start" ? draft.start : draft.end)}
                  mode="date"
                  display="spinner"
                  testID="date-picker"
                  onChange={(_event, picked) => onPickDate(picked)}
                />
              ) : null}
            </YStack>
          </Animated.View>
        </YStack>
      </AppSheet>
    </>
  );
}

/** From / To heading with its current value. The active one is the field the picker drives. */
function FieldHeading({
  label,
  date,
  active,
  onPress,
  testID,
}: {
  label: string;
  date: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      paddingVertical="$2"
      onPress={onPress}
      pressStyle={{ opacity: 0.6 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
    >
      <Paragraph fontWeight="700" color={active ? "$color12" : "$color10"}>
        {label}
      </Paragraph>
      <Paragraph theme={active ? undefined : "alt2"} fontWeight={active ? "600" : "400"}>
        {formatDayLabel(date)}
      </Paragraph>
    </XStack>
  );
}
