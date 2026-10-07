import type { SetLog } from "@/domain/types";
import { formatNumber } from "@/lib/format";

/** "3×10 @ 60 kg · 1×8 @ 62,5 kg": agrupa séries consecutivas iguais. */
export function summarizeSets(sets: Pick<SetLog, "weightKg" | "reps">[]): string {
  const groups: { count: number; weightKg: number; reps: number }[] = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.weightKg === s.weightKg && last.reps === s.reps) last.count += 1;
    else groups.push({ count: 1, weightKg: s.weightKg, reps: s.reps });
  }
  return groups
    .map((g) =>
      g.weightKg > 0
        ? `${g.count}×${g.reps} @ ${formatNumber(g.weightKg, 2)} kg`
        : `${g.count}×${g.reps} (peso corporal)`,
    )
    .join(" · ");
}

export function formatVolume(kg: number): string {
  return `${formatNumber(Math.round(kg), 0)} kg`;
}
