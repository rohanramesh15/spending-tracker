# Mobile design system

**Change the component, not the screen.** If a visual change is asked for, it lands in one file
here and every screen picks it up. A screen that styles a thing itself has to be found and fixed
by hand, and it silently won't be — that is what this directory exists to prevent.

## Where things live

| Concern | Owner | Never do this instead |
|---|---|---|
| Grouped-list geometry (radius, surface, which corners round) | `ui/grouped.ts` | Hard-code a radius on a row |
| A list of transactions | `components/TransactionList.tsx` | Map `TransactionRow` in a screen |
| One transaction's contents | `components/TransactionRow.tsx` | Re-lay-out vendor/amount per screen |
| Category color, ink, tint, label | `shared/lib/categories.ts` | Pick a hex in a component |
| Category pill | `components/CategoryChip.tsx` | Style a pill inline |
| Any pressable label or icon | `ui/Button.tsx` | `<Button>` from `tamagui` directly |
| Grouped list container (surface + separators) | `ui/BlockGroup.tsx` | Stack rows and style them yourself |
| Screen frame, padding, safe area, background taps | `ui/Screen.tsx` | Wrap in your own `SafeAreaView` |
| Card surface | `ui/Card.tsx` | A bordered `YStack` |
| Loading / empty / error | `ui/Skeleton.tsx`, `ui/States.tsx` | Improvise per screen |
| Sheets, dialogs, toasts | `ui/AppSheet.tsx`, `ui/ConfirmDialog.tsx`, `ui/Toast.tsx` | A raw RN `Modal` |
| Form field + label + error | `ui/Field.tsx` | A bare `TextInput` |

Import from the barrel (`@/components/ui`), not the individual files.

## The rules

1. **One owner per visual decision.** Two places deciding the same thing is a bug waiting to be
   half-fixed. `TransactionList` exists because Home and Transactions each did their own corner
   arithmetic, and the same change had to be made twice.
2. **Screens choose behaviour, components choose looks.** A screen says what a tap does; it does
   not say what the row looks like. Any `borderRadius`/`backgroundColor` in a screen file is a
   smell — it means something belongs here and isn't.
3. **Category colors are never re-picked.** `shared/lib/categories.ts` is validated for contrast
   and color-vision deficiency, and its ink/tint pairs are contrast-tested. Reference them.
4. **Every state is a component.** Loading, empty and error are first-class (`ListSkeleton`,
   `EmptyState`, `ErrorState`) because the definition of done requires all four states, and
   screens that improvise them tend to ship only the happy path.
5. **New shared component ⇒ its own test.** `screen-inventory.test.ts` enforces this; its
   backlog is empty and may only shrink.

## Buttons

Six variants, assigned by **purpose**, not by how they should look:

| Variant | Use for | Looks like |
|---|---|---|
| `primary` | The one committing action on a screen | Solid ink, light label |
| `secondary` | Supporting actions | Block surface, ink label |
| `ghost` | Low emphasis — cancel, dismiss, icon buttons | Transparent, muted label |
| `destructive` | Delete, sign out | Red ink on a red tint |
| `success` | Positive confirmation | Solid green |
| `link` | Inline text action | Underlined, blue |

Sizes are `sm` 32 / `md` 44 / `lg` 52. **`md` is the default** — 44pt is the comfortable tap
target. `fullWidth` is a modifier, not a size. `align="between"` makes a trigger (label left,
chevron right) rather than a centred button.

Rules that are enforced by the component, not by discipline:
- **Loading disables.** A second tap would run the same mutation twice; for ingest that means two
  transactions.
- **The spinner replaces the leading icon, never the label**, so the button keeps its width and
  doesn't move out from under a thumb already on its way down.
- **Disabled is opacity**, one rule for every variant — so a new variant cannot ship without one.

One primary per screen. If two actions look equally important, neither is.

## Tokens in use

- **Radius:** `BLOCK_RADIUS` (18) for grouped rows; buttons use 10/16/19 by size — real steps
  from the radius scale, tuned to read as the same family as the blocks.
- **Grouped row surface:** `BLOCK_BACKGROUND` (`$blockBackground`, a custom token — the v4 ramp
  jumps 100% → 95% with nothing between). The page is `SCREEN_BACKGROUND` (`$color1`). These two
  must always differ; setting them equal makes every row invisible, which has already happened.
- **Row padding:** `BLOCK_PADDING_X` (18). **Group heading inset:** `BLOCK_TITLE_INSET` (10).
- **Spacing:** Tamagui `$` scale. Screen padding is owned by `Screen`.
- **Type:** `H2` screen titles, `H3` section headers, `Paragraph` body, `size="$2"` +
  `theme="alt2"` for secondary text.

## Adding a component

1. Build it in `components/ui/` (generic) or `components/` (domain-aware).
2. Export it from `ui/index.ts` if generic.
3. Write its test.
4. Add a row to the table above.
