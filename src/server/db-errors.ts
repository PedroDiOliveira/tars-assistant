import type { Failure } from "@/data/contract";

/** Forma mínima de um erro do PostgREST/supabase-js. */
export interface DbError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

/**
 * Traduz um erro do banco numa falha com mensagem para o usuário.
 *
 * Mensagens que NÓS escrevemos nas funções SQL (em português, com errcode 23514 ou P0002) passam como estão:
 * são as regras de negócio ("O livro tem 320 páginas."). Tudo o mais vira uma mensagem genérica por categoria:
 * o texto cru do Postgres cita tabelas e constraints e nunca deve chegar à tela.
 */
export function translateDbError(error: DbError): Failure {
  const code = error.code ?? "";
  const message = error.message ?? "";

  // Sem código SQL e sem status: a requisição nem chegou ao banco (rede, DNS, projeto pausado).
  if (!code && !error.status) {
    return { ok: false, code: "offline", error: "Sem conexão com o servidor. Nada foi salvo." };
  }

  // Regra de negócio escrita por nós: mensagem em português, sem o texto padrão do Postgres.
  if ((code === "23514" || code === "23505" || code === "P0002") && isOurMessage(message)) {
    return { ok: false, code: "validation", error: message };
  }

  switch (code) {
    case "42501": // sem permissão / RLS
      return message === "Não autenticado."
        ? { ok: false, code: "unauthorized", error: "Sua sessão expirou. Entre de novo." }
        : { ok: false, code: "unauthorized", error: "Você não tem permissão para isso." };
    case "PGRST301": // JWT inválido ou expirado
    case "PGRST303":
      return { ok: false, code: "unauthorized", error: "Sua sessão expirou. Entre de novo." };
    case "23505":
      return { ok: false, code: "conflict", error: "Já existe um registro igual a este." };
    case "23503":
    case "23001":
      return {
        ok: false,
        code: "conflict",
        error: "Este item está em uso ou não existe mais. Atualize a tela e tente de novo.",
      };
    case "23514":
    case "23502":
    case "22P02":
    case "22003":
    case "22007":
    case "22023":
    case "22001":
      return { ok: false, code: "validation", error: "Algum valor informado é inválido." };
    case "57014": // statement_timeout
    case "53300":
    case "08006":
    case "08001":
    case "57P01":
      return { ok: false, code: "offline", error: "O servidor está indisponível no momento. Tente de novo." };
    default:
      return { ok: false, code: "unknown", error: "Não foi possível salvar. Tente de novo." };
  }
}

/** Mensagens escritas nas nossas funções SQL começam com maiúscula e terminam em ponto, sem o prefixo do Postgres. */
function isOurMessage(message: string): boolean {
  if (!message || /^new row for relation|^violates|^insert or update|^duplicate key|^null value|^invalid input/i.test(message)) {
    return false;
  }
  return /[.!]$/.test(message) && /^[A-ZÀ-Ý]/.test(message);
}
