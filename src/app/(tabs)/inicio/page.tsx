import type { Metadata } from "next";
import { HomeScreen } from "@/components/home/home-screen";

export const metadata: Metadata = { title: "Início" };

export default function InicioPage() {
  return <HomeScreen />;
}
