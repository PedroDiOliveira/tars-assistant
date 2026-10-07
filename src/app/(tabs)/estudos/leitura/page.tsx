import type { Metadata } from "next";
import { ReadingScreen } from "@/components/reading/reading-screen";

export const metadata: Metadata = { title: "Leitura" };

export default function LeituraPage() {
  return <ReadingScreen />;
}
