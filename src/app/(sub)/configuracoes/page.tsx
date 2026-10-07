import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata: Metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return <SettingsScreen />;
}
