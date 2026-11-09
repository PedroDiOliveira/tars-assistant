export const APP_NAME = "Tars";
export const APP_TAGLINE = "Seu ritmo, em números simples";

/**
 * Nome do assistente (a "voz" do app: chat, recados do plano de treino, sugestões). Provisório na beta: trocar o nome
 * é trocar este objeto, com as formas já flexionadas (o artigo muda se o nome novo for feminino).
 */
export const ASSISTANT = {
  name: "Tars",
  /** "o Tars" */
  the: "o Tars",
  /** "O Tars" (início de frase) */
  The: "O Tars",
  /** "do Tars" */
  of: "do Tars",
  /** "ao Tars" */
  to: "ao Tars",
} as const;

/** App de um dono só: fuso, moeda e início da semana são constantes, não colunas. */
export const TIMEZONE = "America/Sao_Paulo";
export const CURRENCY = "BRL";
export const LOCALE = "pt-BR";
/** A semana começa na segunda-feira. */
export const WEEK_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export const DEMO_STORAGE_KEY = "tars-demo-v1";
