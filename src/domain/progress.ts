/** Fração 0..1 para barras e anéis. Sem meta (ou meta <= 0) vale 0: nunca divide por zero. */
export function progressRatio(current: number, target: number | null | undefined): number {
  if (!target || target <= 0) return 0;
  return Math.min(Math.max(current / target, 0), 1);
}

/** Percentual real (pode passar de 100 ou ser negativo). null quando não há meta. */
export function progressPercent(
  current: number,
  target: number | null | undefined,
): number | null {
  if (!target || target <= 0) return null;
  return Math.round((current / target) * 100);
}

export type ProgressTone = "ok" | "warn" | "over";

/** Para limites (orçamento): ok até 89%, atenção de 90% a 100%, estourado acima disso. */
export function limitTone(spent: number, limit: number): ProgressTone {
  if (limit <= 0) return "ok";
  const ratio = spent / limit;
  if (ratio > 1) return "over";
  if (ratio >= 0.9) return "warn";
  return "ok";
}
