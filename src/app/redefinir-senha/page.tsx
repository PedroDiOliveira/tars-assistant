import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Nova senha" };

export default function RedefinirSenhaPage() {
  return (
    <div className="min-h-dvh bg-muted/40">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-background px-6 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] md:border-x">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Escolha uma nova senha</h1>
          <p className="text-muted-foreground">Use pelo menos 10 caracteres.</p>
        </div>
        {/* useSearchParams lê a URL no navegador; com Cache Components precisa ficar atrás de um Suspense. */}
        <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" aria-hidden />}>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </div>
  );
}
