"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { useAccount } from "@/data";

/**
 * Cabeçalho enxuto: marca à esquerda, assistente e perfil à direita. No modo demonstração o selo
 * fica discreto, mas visível — a spec exige que dados fictícios nunca pareçam dados reais. No modo real
 * não há selo, e o assistente só aparece se o servidor tem um provedor de IA configurado.
 */
export function AppHeader() {
  const { isLive, displayName, aiEnabled } = useAccount();
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-background/80 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Logo />
        {isLive ? null : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Demo
          </span>
        )}
      </div>
      <div className="-mr-2 flex items-center">
        {aiEnabled ? (
          <Link
            href="/assistente"
            aria-label="Abrir assistente"
            className="grid size-11 place-items-center rounded-full text-foreground/70 transition active:bg-muted"
          >
            <Sparkles className="size-5" aria-hidden />
          </Link>
        ) : null}
        <Link
          href="/configuracoes"
          aria-label="Configurações e perfil"
          className="grid size-11 place-items-center rounded-full transition active:bg-muted"
        >
          <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            {initial}
          </span>
        </Link>
      </div>
    </header>
  );
}
