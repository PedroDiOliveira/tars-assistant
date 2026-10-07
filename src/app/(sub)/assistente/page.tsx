import type { Metadata } from "next";
import { AssistantScreen } from "@/components/assistant/assistant-screen";

export const metadata: Metadata = { title: "Assistente" };

export default function AssistentePage() {
  return <AssistantScreen />;
}
