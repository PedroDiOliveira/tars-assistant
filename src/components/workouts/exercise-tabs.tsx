"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { SEGMENT_TRACK, segmentItem } from "@/components/shared/segmented-styles";

const TABS = [
  { href: "/treino", label: "Musculação" },
  { href: "/treino/corrida", label: "Corrida" },
];

/**
 * Duas seções da aba Exercícios: Musculação | Corrida. São rotas de verdade (abrem por link, recarregam e
 * respondem ao voltar/avançar). Trocar de seção só navega: o treino de musculação em andamento vive no store de
 * rascunho, fora da rota, e não é tocado.
 */
export function ExerciseTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções de Exercícios" className={cn(SEGMENT_TRACK)}>
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={segmentItem(active)}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
