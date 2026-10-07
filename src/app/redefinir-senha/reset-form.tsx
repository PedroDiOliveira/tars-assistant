"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/server/actions/auth";
import type { AuthFormState } from "@/server/auth-input";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const tokenHash = params.get("token_hash") ?? "";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPassword, {});

  if (!tokenHash) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
          Este link de redefinição não é válido. Peça um novo.
        </p>
        <Link href="/esqueci-senha" className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-primary">
          Pedir novo link
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <label className="block space-y-2">
        <span className="text-sm font-medium">Nova senha</span>
        <Input type="password" name="password" autoComplete="new-password" minLength={10} maxLength={72} required autoFocus />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Repita a nova senha</span>
        <Input type="password" name="confirm" autoComplete="new-password" minLength={10} maxLength={72} required />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">{state.error}</p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Salvando…" : "Salvar nova senha"}
      </Button>
      {state.error ? (
        <Link href="/esqueci-senha" className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-primary">
          Pedir novo link
        </Link>
      ) : null}
    </form>
  );
}
