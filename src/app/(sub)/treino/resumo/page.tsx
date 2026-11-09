import type { Metadata } from "next";
import { MonthReportScreen } from "@/components/workouts/month-report-screen";

export const metadata: Metadata = { title: "Resumo do mês" };

export default function ResumoPage() {
  return <MonthReportScreen />;
}
