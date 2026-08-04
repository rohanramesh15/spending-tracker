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

## Tokens in use

- **Radius:** `BLOCK_RADIUS` (12) for grouped rows; `$6` for cards. Keep these equal in feel.
- **Grouped row surface:** `BLOCK_BACKGROUND` (`$color2`) — a step up from the page.
- **Spacing:** Tamagui `$` scale. Screen padding is owned by `Screen`.
- **Type:** `H2` screen titles, `H3` section headers, `Paragraph` body, `size="$2"` +
  `theme="alt2"` for secondary text.

## Adding a component

1. Build it in `components/ui/` (generic) or `components/` (domain-aware).
2. Export it from `ui/index.ts` if generic.
3. Write its test.
4. Add a row to the table above.
