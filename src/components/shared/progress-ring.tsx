import type { ReactNode } from "react";
import { cn } from "cn";

interface ProgressRingProps {
  /** fração 0..1 (já limitada); o valor real fica no texto ao lado */
  ratio: number;
  size?: number;
  stroke?: number;
  /** descrição para leitores de tela, ex.: "2 de 4 treinos nesta semana" */
  label: string;
  className?: string;
  children?: ReactNode;
}

/** Anel de progresso na cor do módulo (data-module no ancestral). */
export function ProgressRing({
  ratio,
  size = 60,
  stroke = 7,
  label,
  className,
  children,
}: ProgressRingProps) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-m-soft"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className={cn(
            "stroke-m transition-[stroke-dashoffset] duration-700 ease-out",
            clamped === 0 && "opacity-0",
          )}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
