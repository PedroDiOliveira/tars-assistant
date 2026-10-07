"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useDisplayName } from "@/data";

/**
 * Cabeçalho enxuto: avatar (perfil) à esquerda e assistente à direita. O selo de demonstração
 * fica discreto, mas visível — a spec exige que dados fictícios nunca pareçam dados reais.
 */
export function AppHeader() {
  const name = useDisplayName();
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-background/80 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Link
          href="/configuracoes"
          aria-label="Configurações e perfil"
          className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
        >
          {initial}
        </Link>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          Demo
        </span>
      </div>
      <Link
        href="/assistente"
        aria-label="Abrir assistente"
        className="-mr-2 grid size-11 place-items-center rounded-full text-foreground/70 transition active:bg-muted"
      >
        <Sparkles className="size-5" aria-hidden />
      </Link>
    </header>
  );
}
