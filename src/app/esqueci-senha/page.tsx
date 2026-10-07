import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <div className="min-h-dvh bg-muted/40">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-background px-6 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] md:border-x">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Esqueci minha senha</h1>
          <p className="text-muted-foreground">
            Informe o e-mail da sua conta {APP_NAME}. Enviaremos um link para escolher uma nova senha.
          </p>
        </div>
        <ForgotPasswordForm />
      </main>
    </div>
  );
}
