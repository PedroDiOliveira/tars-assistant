import type { Metadata } from "next";
import { WaterScreen } from "@/components/water/water-screen";

export const metadata: Metadata = { title: "Água" };

export default function AguaPage() {
  return <WaterScreen />;
}
