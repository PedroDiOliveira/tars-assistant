import type { Metadata } from "next";
import { BreathScreen } from "@/components/breathing/breath-screen";

export const metadata: Metadata = { title: "Respirar" };

export default function RespirarPage() {
  return <BreathScreen />;
}
