import Svg, { Path } from "react-native-svg";

/** The Google "G" mark — inline, no external asset. Ported from the web LoginPage. */
export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.19a5.29 5.29 0 0 1-2.3 3.47v2.88h3.72c2.18-2 3.45-4.96 3.45-8.36z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.12 0 5.74-1.03 7.66-2.79l-3.72-2.88c-1.03.69-2.35 1.1-3.94 1.1-3.03 0-5.6-2.05-6.51-4.8H1.64v2.97A12 12 0 0 0 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.49 14.63a7.2 7.2 0 0 1 0-4.6V7.06H1.64a12 12 0 0 0 0 10.54l3.85-2.97z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.75c1.7 0 3.23.59 4.43 1.74l3.3-3.3C17.73 1.2 15.11 0 12 0A12 12 0 0 0 1.64 7.06l3.85 2.97C6.4 6.8 8.97 4.75 12 4.75z"
      />
    </Svg>
  );
}
