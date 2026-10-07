import type { Metadata } from "next";
import { WorkoutsScreen } from "@/components/workouts/workouts-screen";

export const metadata: Metadata = { title: "Treino" };

export default function TreinoPage() {
  return <WorkoutsScreen />;
}
