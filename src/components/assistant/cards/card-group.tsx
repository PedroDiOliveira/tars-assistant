import { MetricRow } from "@/components/shared/metric-row";
import { Surface } from "@/components/shared/surface";
import type { AssistantCard } from "@/domain/assistant-cards";
import { MODULES } from "@/lib/modules";
import { SummaryCard } from "./summary-card";

/** Três ou mais cards (ex.: "Como foi minha semana?") viram uma lista compacta, como o bloco da semana na Home. */
function CompactGroup({ cards }: { cards: AssistantCard[] }) {
  const periods = [...new Set(cards.map((card) => card.periodLabel))];
  const shared = periods.length === 1;

  return (
    <div className="space-y-2">
      {shared ? <p className="px-1 text-xs text-muted-foreground">Período: {periods[0]}</p> : null}
      <Surface
        role="group"
        aria-label={`Resumo de ${cards.map((card) => MODULES[card.module].label).join(", ")}`}
        className="divide-y divide-border/60 overflow-hidden"
      >
        {cards.map((card) => {
          const meta = MODULES[card.module];
          const note = [card.progress?.caption || card.headline.notes[0] || null, shared ? null : card.periodLabel]
            .filter(Boolean)
            .join(" · ");
          return (
            <MetricRow
              key={card.id}
              href={meta.href}
              module={card.module}
              icon={meta.icon}
              label={meta.label}
              value={card.headline.value}
              unit={card.headline.unit ?? undefined}
              ratio={card.progress?.ratio}
              progressLabel={card.progress?.label}
              note={note || null}
            />
          );
        })}
      </Surface>
    </div>
  );
}

export function MessageCards({ cards }: { cards: AssistantCard[] }) {
  if (cards.length === 0) return null;
  if (cards.length >= 3) return <CompactGroup cards={cards} />;
  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <SummaryCard key={card.id} card={card} />
      ))}
    </div>
  );
}
