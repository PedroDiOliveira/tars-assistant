import type { Metadata } from "next";
import { HistoryScreen } from "@/components/workouts/history-screen";

export const metadata: Metadata = { title: "Histórico de musculação" };

export default function HistoricoPage() {
  return <HistoryScreen />;
}
