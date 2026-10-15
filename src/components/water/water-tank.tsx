import { useId } from "react";

/**
 * Um copo que enche conforme o dia: o nível é a fração da meta (0 a 1). É o mesmo número da barra de progresso, em
 * outra forma; por isso o valor em texto sempre acompanha. Com "reduzir movimento" o nível troca sem animar.
 */
export function WaterTank({ ratio, label, className }: { ratio: number; label: string; className?: string }) {
  const clipId = useId();
  const level = Math.min(Math.max(ratio, 0), 1);
  // Interior do copo: de y=10 (boca) a y=106 (fundo), 96 unidades de altura.
  const shift = (1 - level) * 96;
  const outline = "M10 6h52l-4.5 100a8 8 0 0 1-8 7.6H22.5a8 8 0 0 1-8-7.6L10 6Z";
  return (
    <svg viewBox="0 0 72 120" role="img" aria-label={label} className={className}>
      <defs>
        <clipPath id={clipId}>
          <path d={outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g
          className="transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{ transform: `translateY(${shift}px)` }}
        >
          <rect x="0" y="10" width="72" height="120" fill="currentColor" fillOpacity={0.9} />
          <path d="M0 10c6-3.2 12-3.2 18 0s12 3.2 18 0 12-3.2 18 0 12 3.2 18 0v-6H0Z" fill="currentColor" fillOpacity={0.9} />
        </g>
      </g>
      <path d={outline} fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
}
