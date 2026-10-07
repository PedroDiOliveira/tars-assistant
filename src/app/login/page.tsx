import type { Metadata } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-muted/40">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 bg-background px-6 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] md:border-x">
        <div className="space-y-3 text-center">
          <span
            aria-hidden
            className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground"
          >
            T
          </span>
          <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-muted-foreground">{APP_TAGLINE}</p>
        </div>
        <LoginForm />
      </main>
    </div>
  );
}
