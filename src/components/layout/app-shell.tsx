"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "cn";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

function Frame({ children, chrome }: { children: ReactNode; chrome: boolean }) {
  useEffect(() => {
    // Sinaliza que o JavaScript do app rodou; ver BootCheck.
    document.documentElement.setAttribute("data-app-ready", "");
  }, []);

  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background md:border-x">
        {chrome ? <AppHeader /> : null}
        <main className={cn("flex-1", chrome && "pb-[calc(6rem+env(safe-area-inset-bottom))]")}>
          {children}
        </main>
        {chrome ? <BottomNav /> : null}
      </div>
    </div>
  );
}

/** Abas principais (Início, Finanças, Treino, Estudos): cabeçalho com marca/assistente/perfil e barra inferior. */
export function TabsShell({ children }: { children: ReactNode }) {
  return <Frame chrome>{children}</Frame>;
}

/** Telas internas (sessão de treino, histórico, assistente, configurações): sem barra inferior. */
export function SubShell({ children }: { children: ReactNode }) {
  return <Frame chrome={false}>{children}</Frame>;
}
