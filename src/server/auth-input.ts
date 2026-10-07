import { z } from "zod";

/** Estado devolvido pelas actions de formulário (`useActionState`). */
export interface AuthFormState {
  error?: string;
  message?: string;
  /** E-mail digitado, devolvido junto do erro: o React 19 limpa o formulário depois da action e a pessoa não deve redigitá-lo. */
  email?: string;
}

export const MIN_PASSWORD_LENGTH = 10;
/** O Supabase usa bcrypt, que ignora tudo depois de 72 caracteres: aceitar mais seria uma falsa promessa. */
export const MAX_PASSWORD_LENGTH = 72;

const email = z.string().trim().toLowerCase().max(254).pipe(z.email({ error: "Informe um e-mail válido." }));

const field = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export function parseLogin(formData: FormData): { ok: true; email: string; password: string } | { ok: false; error: string } {
  const parsedEmail = email.safeParse(field(formData, "email"));
  const password = field(formData, "password");
  // Na entrada não se valida a força da senha: só que algo foi digitado.
  if (!parsedEmail.success || password === "" || password.length > 1024) {
    return { ok: false, error: "Informe e-mail e senha." };
  }
  return { ok: true, email: parsedEmail.data, password };
}

export function parseEmail(formData: FormData): { ok: true; email: string } | { ok: false; error: string } {
  const parsed = email.safeParse(field(formData, "email"));
  return parsed.success ? { ok: true, email: parsed.data } : { ok: false, error: parsed.error.issues[0].message };
}

export function parseNewPassword(
  formData: FormData,
): { ok: true; password: string; tokenHash: string } | { ok: false; error: string } {
  const password = field(formData, "password");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== field(formData, "confirm")) return { ok: false, error: "As senhas não são iguais." };
  const tokenHash = field(formData, "token_hash");
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(tokenHash)) {
    return { ok: false, error: "Este link de redefinição não é válido. Peça um novo." };
  }
  return { ok: true, password, tokenHash };
}

/** Forma mínima de um erro do Supabase Auth. */
export interface AuthErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

/**
 * Mensagem para quem tentou entrar. É a MESMA para e-mail inexistente e senha errada: diferenciar permitiria
 * descobrir quais e-mails têm conta (enumeração de usuários).
 */
export function signInErrorMessage(error: AuthErrorLike): string {
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (error.status === undefined || error.status === 0) return "Sem conexão com o servidor. Tente de novo.";
  if (error.status >= 500) return "O servidor está indisponível no momento. Tente de novo.";
  return "E-mail ou senha incorretos.";
}

export function resetErrorMessage(error: AuthErrorLike): string {
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (error.code === "same_password") return "Escolha uma senha diferente da atual.";
  if (error.code === "weak_password") return "Essa senha é fraca demais. Use uma mais longa e variada.";
  if (error.status === undefined || error.status === 0) return "Sem conexão com o servidor. Tente de novo.";
  return "Este link de redefinição expirou ou já foi usado. Peça um novo.";
}
