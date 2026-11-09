import type { Metadata } from "next";
import { PlanScreen } from "@/components/training-plan/plan-screen";

export const metadata: Metadata = { title: "Plano de treino" };

export default function PlanoPage() {
  return <PlanScreen />;
}
