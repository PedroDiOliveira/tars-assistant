import { Surface } from "@/components/shared/surface";
import { DAY_PART_LABEL, formatLiters, type DayRhythm } from "@/domain/water";

/** Quando a água é bebida (manhã, tarde, noite) nos últimos 30 dias. Cada barra tem o valor em texto ao lado. */
export function WaterRhythm({ rhythm }: { rhythm: DayRhythm }) {
  return (
    <section className="space-y-2" aria-labelledby="water-rhythm-title">
      <h2 id="water-rhythm-title" className="px-1 text-base font-semibold">
        Ritmo do dia
      </h2>
      <Surface className="space-y-4 p-5">
        <ul className="space-y-3">
          {rhythm.parts.map(({ part, ml, share }) => {
            const percent = Math.round(share * 100);
            return (
              <li key={part} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3">
                <span className="text-sm">{DAY_PART_LABEL[part]}</span>
                <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-m transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
                </span>
                <span className="w-24 text-right text-sm tabular-nums">
                  {percent}% <span className="text-muted-foreground">· {formatLiters(ml)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">
          {rhythm.insight ?? "Registre alguns dias para ver em que horas você mais bebe água."}
          <span className="block text-xs">Últimos 30 dias · manhã 5h-12h, tarde 12h-18h, noite 18h-5h.</span>
        </p>
      </Surface>
    </section>
  );
}
