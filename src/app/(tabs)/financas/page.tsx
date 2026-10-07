import type { Metadata } from "next";
import { FinanceScreen } from "@/components/finance/finance-screen";

export const metadata: Metadata = { title: "Finanças" };

export default function FinancasPage() {
  return <FinanceScreen />;
}
