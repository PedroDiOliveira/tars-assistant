import type { ReactNode } from "react";
import { ExerciseTabs } from "@/components/workouts/exercise-tabs";

/** Exercícios: a área da navegação inferior. Musculação (/treino) e Corrida (/treino/corrida) são as seções. */
export default function ExercisesLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="space-y-4 px-4 pt-1 pb-5">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Exercícios</h1>
        <ExerciseTabs />
      </div>
      {children}
    </div>
  );
}
