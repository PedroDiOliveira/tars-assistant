import type { Metadata } from "next";
import { RunningHistoryScreen } from "@/components/running/running-history-screen";

export const metadata: Metadata = { title: "Histórico de corridas" };

export default function HistoricoCorridasPage() {
  return <RunningHistoryScreen />;
}
