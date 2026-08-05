import { Link, Stack } from "expo-router";
import { H2, Paragraph, YStack } from "tamagui";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!", headerShown: true }} />
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$5" gap="$3">
        <H2>This screen doesn&apos;t exist.</H2>
        <Link href="/">
          <Paragraph color="$blue10">Go to home screen</Paragraph>
        </Link>
      </YStack>
    </>
  );
}
