import type { Metadata } from "next";
import { WorkoutsScreen } from "@/components/workouts/workouts-screen";

export const metadata: Metadata = { title: "Musculação" };

export default function TreinoPage() {
  return <WorkoutsScreen />;
}
