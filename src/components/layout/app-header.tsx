"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { useDisplayName } from "@/data";

/** Cabeçalho das abas principais: marca, selo de demonstração, assistente e perfil. */
export function AppHeader() {
  const name = useDisplayName();
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-background/85 px-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
        >
          T
        </span>
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink">
          Demonstração
        </span>
      </div>
      <div className="-mr-2 flex items-center">
        <Link
          href="/assistente"
          aria-label="Abrir assistente"
          className="grid size-11 place-items-center rounded-full text-foreground/80 transition active:bg-muted"
        >
          <Sparkles className="size-5" aria-hidden />
        </Link>
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
