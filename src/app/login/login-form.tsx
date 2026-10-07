"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IS_LIVE } from "@/lib/app-mode";
import { signIn } from "@/server/actions/auth";
import type { AuthFormState } from "@/server/auth-input";

const FIELD = "block space-y-2";

export function LoginForm() {
  return IS_LIVE ? <LiveLoginForm /> : <DemoLoginForm />;
}

/** Modo real: autentica no servidor (Supabase Auth); o cookie de sessão é gravado pela Server Action. */
function LiveLoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <label className={FIELD}>
        <span className="text-sm font-medium">E-mail</span>
        <Input type="email" name="email" autoComplete="username" inputMode="email" defaultValue={state.email} required autoFocus />
      </label>
      <label className={FIELD}>
        <span className="text-sm font-medium">Senha</span>
        <Input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <Link href="/esqueci-senha" className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-primary">
        Esqueci minha senha
      </Link>
    </form>
  );
}

/** Modo demonstração: sem autenticação; o app abre com dados fictícios deste navegador. */
function DemoLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/inicio");
      }}
    >
      <label className={FIELD}>
        <span className="text-sm font-medium">E-mail</span>
        <Input type="email" autoComplete="email" placeholder="voce@tars.example" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className={FIELD}>
        <span className="text-sm font-medium">Senha</span>
        <Input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Button type="submit" size="lg" className="w-full">
        Entrar
      </Button>
      <button
        type="button"
        className="min-h-11 w-full text-sm font-medium text-primary"
        onClick={() => toast.info("A recuperação de senha existe só no modo real.")}
      >
        Esqueci minha senha
      </button>
      <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Modo demonstração: sem autenticação. Toque em Entrar para ver o app com dados fictícios deste navegador.</p>
      </div>
    </form>
  );
}
