import { BookOpen, Droplet, Dumbbell, Footprints, GraduationCap, Wallet, type LucideIcon } from "lucide-react";

export type ModuleKey = "finance" | "workout" | "running" | "study" | "reading" | "water";

export interface ModuleMeta {
  key: ModuleKey;
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Rótulos e rotas de cada módulo; a cor vem do atributo data-module (ver globals.css).
 * "Exercícios" é a área (aba de navegação, rota /treino) e contém duas seções: Musculação e Corrida.
 */
export const MODULES: Record<ModuleKey, ModuleMeta> = {
  finance: { key: "finance", label: "Finanças", href: "/financas", icon: Wallet },
  workout: { key: "workout", label: "Musculação", href: "/treino", icon: Dumbbell },
  running: { key: "running", label: "Corrida", href: "/treino/corrida", icon: Footprints },
  study: { key: "study", label: "Estudos", href: "/estudos", icon: GraduationCap },
  reading: { key: "reading", label: "Leitura", href: "/estudos/leitura", icon: BookOpen },
  // Água não é uma aba: é um card da Início e uma tela interna (/agua).
  water: { key: "water", label: "Água", href: "/agua", icon: Droplet },
};
