import type { Metadata } from "next";
import { ProfileWizard } from "@/components/training-plan/profile-wizard";

export const metadata: Metadata = { title: "Montar meu plano" };

export default function PerguntasPage() {
  return <ProfileWizard />;
}
