"use server";

import { redirect } from "next/navigation";
import { IS_LIVE } from "@/lib/app-mode";
import {
  parseEmail,
  parseLogin,
  parseNewPassword,
  resetErrorMessage,
  signInErrorMessage,
  type AuthFormState,
} from "../auth-input";
import { createSupabase } from "../supabase";

const NOT_LIVE: AuthFormState = { error: "O login só existe no modo real do app." };

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!IS_LIVE) return NOT_LIVE;
  const typedEmail = String(formData.get("email") ?? "").trim().slice(0, 320);
  const input = parseLogin(formData);
  if (!input.ok) return { error: input.error, email: typedEmail };

  const supabase = await createSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) return { error: signInErrorMessage(error), email: typedEmail };

  // Fora de try/catch: `redirect` funciona lançando uma exceção especial do Next.
  redirect("/inicio");
}

/**
 * Pede o e-mail de redefinição. A resposta é SEMPRE a mesma, exista ou não a conta: dizer "e-mail não
 * encontrado" permitiria descobrir quais e-mails têm cadastro.
 */
export async function requestPasswordReset(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!IS_LIVE) return NOT_LIVE;
  const input = parseEmail(formData);
  if (!input.ok) return { error: input.error };

  const supabase = await createSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(input.email);
  // Só falhas que o usuário pode agir (limite de envios, rede) aparecem; "usuário não existe" nunca.
  if (error && (error.status === 429 || error.status === undefined || error.status === 0)) {
    return { error: resetErrorMessage(error) };
  }
  return { message: "Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha." };
}

/**
 * Conclui a redefinição. O token do e-mail só é consumido AQUI, quando a pessoa envia o formulário, e não ao
 * abrir o link: scanners de e-mail que "clicam" nos links não conseguem queimar um token de uso único.
 */
export async function resetPassword(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!IS_LIVE) return NOT_LIVE;
  const input = parseNewPassword(formData);
  if (!input.ok) return { error: input.error };

  const supabase = await createSupabase();
  const verified = await supabase.auth.verifyOtp({ type: "recovery", token_hash: input.tokenHash });
  if (verified.error) return { error: resetErrorMessage(verified.error) };

  const updated = await supabase.auth.updateUser({ password: input.password });
  if (updated.error) return { error: resetErrorMessage(updated.error) };

  redirect("/inicio");
}

/** Encerra a sessão (revoga o refresh token e apaga os cookies). O navegador limpa os dados locais. */
export async function signOut(): Promise<{ ok: boolean }> {
  if (!IS_LIVE) return { ok: true };
  const supabase = await createSupabase();
  const { error } = await supabase.auth.signOut();
  return { ok: !error };
}
