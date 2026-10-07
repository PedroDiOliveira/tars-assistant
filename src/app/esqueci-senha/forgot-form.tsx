"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/server/actions/auth";
import type { AuthFormState } from "@/server/auth-input";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <label className="block space-y-2">
        <span className="text-sm font-medium">E-mail</span>
        <Input type="email" name="email" autoComplete="username" inputMode="email" required autoFocus />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">{state.error}</p>
      ) : null}
      {state.message ? (
        <p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success-ink">{state.message}</p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link"}
      </Button>
      <Link href="/login" className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-primary">
        Voltar para o login
      </Link>
    </form>
  );
}
