import type { Metadata } from "next";
import { SessionScreen } from "@/components/workouts/session-screen";

export const metadata: Metadata = { title: "Treino em andamento" };

export default function SessaoPage() {
  return <SessionScreen />;
}
