"use client";

import Link from "next/link";
import { Sparkles, Wind } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { markBreathEntry } from "@/components/breathing/breath-origin";
import { displayInitial } from "@/domain/profile";
import { useAccount } from "@/data";

/**
 * Cabeçalho enxuto: marca à esquerda, respiração, assistente e perfil à direita. No modo demonstração o selo
 * fica discreto, mas visível — a spec exige que dados fictícios nunca pareçam dados reais. No modo real
 * não há selo, e o assistente só aparece se o servidor tem um provedor de IA configurado.
 * A respiração guiada é um apoio, não uma ação da rotina: ícone mais apagado que o do assistente.
 */
export function AppHeader() {
  const { isLive, displayName, aiEnabled } = useAccount();
  const initial = displayInitial(displayName);
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
        <Link
          href="/respirar"
          onClick={markBreathEntry}
          aria-label="Respirar: pausa guiada"
          className="grid size-11 place-items-center rounded-full text-foreground/50 transition active:bg-muted"
        >
          <Wind className="size-5" aria-hidden />
        </Link>
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
