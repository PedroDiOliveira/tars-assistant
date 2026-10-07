import type { Metadata } from "next";
import { StudyScreen } from "@/components/studies/study-screen";

export const metadata: Metadata = { title: "Estudos" };

export default function EstudosPage() {
  return <StudyScreen />;
}
