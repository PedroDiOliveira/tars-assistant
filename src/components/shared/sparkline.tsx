import { cn } from "cn";

interface SparklineProps {
  values: number[];
  summary: string;
  width?: number;
  height?: number;
  className?: string;
}

/** Linha simples de evolução na cor do módulo. Sempre acompanhada dos valores em texto. */
export function Sparkline({ values, summary, width = 280, height = 72, className }: SparklineProps) {
  if (values.length === 0) return null;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = values.length > 1 ? pad + i * stepX : width / 2;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-auto w-full overflow-visible", className)}
    >
      {points.length > 1 ? (
        <path d={path} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-m" />
      ) : null}
      {points.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === points.length - 1 ? 4.5 : 3}
          className={i === points.length - 1 ? "fill-m" : "fill-card stroke-m"}
          strokeWidth={2}
        />
      ))}
      <circle cx={last[0]} cy={last[1]} r={9} className="fill-m opacity-15" />
    </svg>
  );
}
