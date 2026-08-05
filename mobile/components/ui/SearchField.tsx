import Feather from "@expo/vector-icons/Feather";
import { Input, XStack } from "tamagui";

import { BLOCK_BACKGROUND, BLOCK_PADDING_X, BLOCK_RADIUS } from "./grouped";

/**
 * Search input, styled as one of the app's grouped surfaces so it belongs to the same family as
 * the rows beneath it.
 *
 * The clear button only appears once there is something to clear — a permanently visible × on an
 * empty field is a control that does nothing, and it competes with the placeholder.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
  testID,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  return (
    <XStack
      alignItems="center"
      gap="$2.5"
      paddingHorizontal={BLOCK_PADDING_X}
      backgroundColor={BLOCK_BACKGROUND}
      borderRadius={BLOCK_RADIUS}
      height={50}
    >
      <Feather name="search" size={16} color="#8a8a8e" />
      <Input
        unstyled
        flex={1}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="$color10"
        color="$color12"
        fontSize={15}
        // A search field should never capitalise or autocorrect what it is matching against.
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel={placeholder}
        testID={testID}
      />
      {value.length > 0 ? (
        <XStack
          onPress={() => onChangeText("")}
          pressStyle={{ opacity: 0.5 }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          testID={testID ? `${testID}-clear` : undefined}
        >
          <Feather name="x-circle" size={16} color="#8a8a8e" />
        </XStack>
      ) : null}
    </XStack>
  );
}
