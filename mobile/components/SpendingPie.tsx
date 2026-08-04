import { useState } from "react";
import Svg, { Defs, G, Line, Path, Pattern, Rect, Text as SvgText } from "react-native-svg";
import { Paragraph, useTheme, XStack, YStack } from "tamagui";

import type { SpendingSlice } from "@shared/api/types";
import { categoryColor, categoryLabel, HATCHED, isHatched } from "@shared/lib/categories";
import { formatCents } from "@shared/lib/money";

const SIZE = 220;
const OUTER = 100;
const INNER = 58;
const CENTER = SIZE / 2;

/** Pattern ids must be valid XML names, so strip everything but letters. */
function patternId(category: string): string {
  return `hatch-${category.replace(/[^a-zA-Z]/g, "")}`;
}

function fillFor(category: string): string {
  return isHatched(category) ? `url(#${patternId(category)})` : categoryColor(category);
}

/** Readable ink for the on-slice percentage: dark on light fills, white on dark ones. */
export function labelInkFor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#334155" : "#ffffff";
}

/**
 * Share of the total, as a whole-percent label. Pure and exported so the arithmetic is tested
 * directly — asserting it through the rendered SVG means reaching into react-native-svg's
 * TSpan internals, which tests the library rather than this chart.
 */
export function percentLabel(cents: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (cents / total) * 100;
  // A slice that exists but rounds to 0% must not claim to be 0% — you can see it on screen.
  if (pct > 0 && pct < 0.5) return "<1%";
  return `${Math.round(pct)}%`;
}

function polar(angleDeg: number, radius: number) {
  // -90 so 0° is the top of the circle, matching the web chart's starting position.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

/**
 * Donut segment path. Exported for tests: the arc maths is the part most likely to break
 * silently (a wrong large-arc flag renders an inside-out wedge that still "looks like a chart").
 */
export function donutSegmentPath(
  startAngle: number,
  endAngle: number,
  outer = OUTER,
  inner = INNER,
): string {
  // A full circle can't be expressed as a single arc — its start and end points coincide, so
  // the renderer draws nothing. Split it into two half arcs.
  const sweep = endAngle - startAngle;
  if (sweep >= 360) {
    return [
      donutSegmentPath(startAngle, startAngle + 180, outer, inner),
      donutSegmentPath(startAngle + 180, startAngle + 360, outer, inner),
    ].join(" ");
  }

  const largeArc = sweep > 180 ? 1 : 0;
  const o1 = polar(startAngle, outer);
  const o2 = polar(endAngle, outer);
  const i2 = polar(endAngle, inner);
  const i1 = polar(startAngle, inner);

  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${i1.x} ${i1.y}`,
    "Z",
  ].join(" ");
}

/**
 * Spending by category (user-flow §8a). Native port of the Recharts version.
 *
 * The important properties carried over from web, all of which are load-bearing rather than
 * decorative:
 *  - Color follows the CATEGORY, never the slice's position, and an unknown label falls back
 *    to Other's neutral instead of borrowing a hue.
 *  - Tip and Uncategorized are hatched (45°/135°). They share a hue with Tax and Other, so the
 *    hatch — not the color — is what distinguishes them, and it survives color-vision
 *    deficiency and dark mode where a second hue step would not.
 *  - Slices are drawn WITHOUT a separating stroke, by request. The hatching above is doing the
 *    real work of telling same-hue neighbours apart; the stroke was belt-and-braces. Selection
 *    is shown by the slice popping outward (+4px) and the readout, not by an outline.
 *
 * Interaction is native-first: tapping a slice selects it and reveals its percentage plus an
 * amount readout in the donut hole, where web used a hover tooltip that a phone has no
 * equivalent for.
 */
export function SpendingPie({
  slices,
  activeIndex: controlledIndex,
  onActiveIndexChange,
}: {
  slices: SpendingSlice[];
  /**
   * Optional controlled selection. Supplied by a screen that needs to clear the selection from
   * outside the chart — tapping elsewhere on the page should return the pie to its default
   * view, and only the screen knows about taps that land outside the chart.
   */
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}) {
  const theme = useTheme();
  const [uncontrolledIndex, setUncontrolledIndex] = useState(-1);
  const isControlled = controlledIndex !== undefined;
  const activeIndex = isControlled ? controlledIndex : uncontrolledIndex;
  const setActiveIndex = (next: number) =>
    isControlled ? onActiveIndexChange?.(next) : setUncontrolledIndex(next);

  const total = slices.reduce((sum, s) => sum + s.cents, 0);
  if (total <= 0) return null;

  let cursor = 0;
  const segments = slices.map((slice, index) => {
    const sweep = (slice.cents / total) * 360;
    const seg = { slice, index, startAngle: cursor, endAngle: cursor + sweep, sweep };
    cursor += sweep;
    return seg;
  });

  const active = activeIndex >= 0 ? segments[activeIndex] : undefined;
  // Resolved from the theme so the readout stays legible in dark mode too.
  const holeInk = (theme.color?.val as string | undefined) ?? "#0f172a";

  return (
    <YStack alignItems="center" gap="$3" paddingBottom="$4" testID="spending-pie">
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          {Object.entries(HATCHED).map(([category, angle]) => (
            <Pattern
              key={category}
              id={patternId(category)}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${angle})`}
            >
              <Rect width={6} height={6} fill={categoryColor(category)} />
              <Line x1={0} y1={0} x2={0} y2={6} stroke="#ffffff" strokeWidth={2.5} />
            </Pattern>
          ))}
        </Defs>

        <G>
          {segments.map(({ slice, index, startAngle, endAngle }) => {
            const selected = index === activeIndex;
            return (
              <Path
                key={slice.category}
                d={donutSegmentPath(startAngle, endAngle, selected ? OUTER + 4 : OUTER)}
                fill={fillFor(slice.category)}
                onPress={() => setActiveIndex(activeIndex === index ? -1 : index)}
                testID={`pie-slice-${slice.category}`}
              />
            );
          })}
        </G>

        {active ? (
          <SvgText
            testID="pie-percent"
            x={CENTER}
            y={CENTER + 5}
            fontSize={18}
            fontWeight="700"
            textAnchor="middle"
            /*
             * Coloured for the PAGE, not the slice. This label sits in the donut hole — over the
             * page background — but used to take its ink from the slice's own colour, so any
             * dark slice (Other, Entertainment) rendered white text on a white hole and the
             * percentage was simply invisible.
             */
            fill={holeInk}
          >
            {percentLabel(active.slice.cents, total)}
          </SvgText>
        ) : null}
      </Svg>

      {active ? (
        <YStack alignItems="center" testID="pie-selection">
          <Paragraph fontWeight="600">{categoryLabel(active.slice.category)}</Paragraph>
          <Paragraph theme="alt2">{formatCents(active.slice.cents)}</Paragraph>
        </YStack>
      ) : null}

      <XStack flexWrap="wrap" justifyContent="center" gap="$3" paddingHorizontal="$2">
        {slices.map((s) => (
          <XStack key={s.category} alignItems="center" gap="$2">
            <YStack width={10} height={10} borderRadius={2} backgroundColor={categoryColor(s.category)} />
            <Paragraph size="$2">{categoryLabel(s.category)}</Paragraph>
          </XStack>
        ))}
      </XStack>
    </YStack>
  );
}
