import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { ExerciseDetailScreen } from "@/components/workouts/exercise-detail-screen";

export const metadata: Metadata = { title: "Evolução do exercício" };

export default function ExercicioPage({ params }: PageProps<"/treino/exercicio/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ id }) => (
        <ExerciseDetailScreen exerciseId={id} />
      ))}
    </Suspense>
  );
}
