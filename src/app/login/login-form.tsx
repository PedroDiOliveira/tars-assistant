"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Só layout: o login real (Supabase Auth) entra na fase de fundação. */
export function LoginForm() {
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
      <label className="block space-y-2">
        <span className="text-sm font-medium">E-mail</span>
        <Input
          type="email"
          autoComplete="email"
          placeholder="voce@tars.example"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Senha</span>
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <Button type="submit" size="lg" className="w-full">
        Entrar
      </Button>
      <button
        type="button"
        className="min-h-11 w-full text-sm font-medium text-primary"
        onClick={() => toast.info("A recuperação de senha entra junto com o login real.")}
      >
        Esqueci minha senha
      </button>
      <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Protótipo: ainda não há autenticação. Toque em Entrar para ver o app com dados de demonstração.</p>
      </div>
    </form>
  );
}
