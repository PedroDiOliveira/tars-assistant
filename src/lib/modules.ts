import { BookOpen, Dumbbell, GraduationCap, Wallet, type LucideIcon } from "lucide-react";

export type ModuleKey = "finance" | "workout" | "study" | "reading";

export interface ModuleMeta {
  key: ModuleKey;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Rótulos e rotas de cada módulo; a cor vem do atributo data-module (ver globals.css). */
export const MODULES: Record<ModuleKey, ModuleMeta> = {
  finance: { key: "finance", label: "Finanças", href: "/financas", icon: Wallet },
  workout: { key: "workout", label: "Treino", href: "/treino", icon: Dumbbell },
  study: { key: "study", label: "Estudos", href: "/estudos", icon: GraduationCap },
  reading: { key: "reading", label: "Leitura", href: "/estudos/leitura", icon: BookOpen },
};
