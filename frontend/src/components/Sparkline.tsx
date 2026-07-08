/** A tiny inline price-over-time sparkline (Phase 4 recurring view). Dependency-free SVG. */
export function Sparkline({
  values,
  width = 72,
  height = 22,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} aria-hidden />; // not enough points for a line
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);
  const points = values
    .map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="text-primary"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
