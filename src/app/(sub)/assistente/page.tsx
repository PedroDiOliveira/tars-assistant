import { ASSISTANT } from "@/lib/constants";
import type { Metadata } from "next";
import { AssistantScreen } from "@/components/assistant/assistant-screen";

export const metadata: Metadata = { title: ASSISTANT.name };

export default function AssistentePage() {
  return <AssistantScreen />;
}
