import type { ReactNode } from "react";
import { Input, Label, Paragraph, YStack } from "tamagui";

/**
 * Labelled form control with an error slot — the native equivalent of the web's
 * Label + Input + error-text grouping used across manual entry and the confirm screens.
 *
 * The error is rendered in the accessibility tree AND visually, because on a phone the field
 * may be scrolled off when the user submits.
 */
export function Field({
  label,
  error,
  children,
  required,
}: {
  label: string;
  error?: string | null;
  children?: ReactNode;
  required?: boolean;
}) {
  return (
    <YStack gap="$2">
      <Label size="$3" fontWeight="600">
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
      {error ? (
        <Paragraph size="$2" color="$red10" accessibilityRole="alert">
          {error}
        </Paragraph>
      ) : null}
    </YStack>
  );
}

/**
 * Text input pre-wired for the app's forms. `inputMode="decimal"` is the right default for the
 * money fields that dominate this app; callers override for text.
 */
export function TextField({
  value,
  onChangeText,
  placeholder,
  invalid,
  inputMode = "text",
  testID,
  autoFocus,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  invalid?: boolean;
  inputMode?: "text" | "decimal" | "numeric" | "email";
  testID?: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      inputMode={inputMode}
      testID={testID}
      autoFocus={autoFocus}
      // React Native has no "invalid" accessibility state (unlike aria-invalid on the web), so
      // the invalid styling is visual only. The spoken announcement is carried by the sibling
      // error text in <Field>, which is marked accessibilityRole="alert".
      borderColor={invalid ? "$red8" : "$borderColor"}
    />
  );
}
