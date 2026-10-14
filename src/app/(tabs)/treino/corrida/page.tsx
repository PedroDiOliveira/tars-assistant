import type { Metadata } from "next";
import { RunningScreen } from "@/components/running/running-screen";

export const metadata: Metadata = { title: "Corrida" };

export default function CorridaPage() {
  return <RunningScreen />;
}
