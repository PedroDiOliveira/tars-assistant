/**
 * Nome de exibição: como a pessoa aparece no app (saudação, avatar, Configurações).
 *
 * É a regra ÚNICA: o formulário (feedback imediato), a Server Action (a que vale), o modo demo e a documentação usam
 * esta função. O banco repete as proibições mais perigosas num gatilho (`private.check_profile_name`), para quem
 * falar com a API sem passar pelo app; o teste `supabase/tests/profile-name.test.ts` confere que os dois concordam.
 */

export const MAX_DISPLAY_NAME_LENGTH = 60;

/** Teto do texto bruto: um valor gigante nem chega a ser normalizado. Folga para espaços que serão colapsados. */
const MAX_RAW_LENGTH = 200;

/** Quantos sinais de combinação seguidos (acentos) cabem. Português e vietnamita usam até 2 ou 3; acima disso é "zalgo". */
const MAX_COMBINING_RUN = 4;

export type DisplayNameResult = { ok: true; name: string } | { ok: false; error: string };

/**
 * Proibidos: controles (inclui tab e quebra de linha), formatação invisível (largura zero, marcas e substituições
 * bidirecionais, hífen suave), substitutos soltos (quebram a codificação UTF-8), uso privado e separadores de
 * linha/parágrafo. Fora de propósito: "não atribuídos" (Cn), porque dependem da versão do Unicode do navegador e do
 * servidor e recusariam um emoji novo à toa.
 */
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const COMBINING_RUN = new RegExp(`\\p{M}{${MAX_COMBINING_RUN + 1},}`, "u");

/** Tamanho em pontos de código (o mesmo que `char_length` do Postgres), não em unidades UTF-16 do JavaScript. */
function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Normaliza e valida o que a pessoa digitou. Normalizar é só o que não muda o sentido: Unicode NFC (o "ã" digitado
 * e o "a" + "~" colado viram o mesmo texto), qualquer espaço (inclusive o não separável, comum ao colar) vira um
 * espaço comum, e sobras nas pontas e repetições somem. O resto é recusado com a razão, nunca "limpo" em silêncio.
 */
export function parseDisplayName(raw: unknown): DisplayNameResult {
  if (typeof raw !== "string") return { ok: false, error: "Informe um nome." };
  if (raw.length > MAX_RAW_LENGTH) return tooLong();

  const name = raw
    .normalize("NFC")
    .replace(/\p{Zs}+/gu, " ")
    .replace(/^ | $/g, "");

  if (name === "") return { ok: false, error: "Informe um nome." };
  if (FORBIDDEN.test(name)) {
    return { ok: false, error: "O nome não pode ter quebras de linha, caracteres de controle ou invisíveis." };
  }
  if (codePointLength(name) > MAX_DISPLAY_NAME_LENGTH) return tooLong();
  if (COMBINING_RUN.test(name)) return { ok: false, error: "O nome tem acentos demais em sequência." };
  if (!HAS_LETTER_OR_DIGIT.test(name)) return { ok: false, error: "Use pelo menos uma letra ou um número." };
  return { ok: true, name };
}

function tooLong(): DisplayNameResult {
  return { ok: false, error: `O nome pode ter no máximo ${MAX_DISPLAY_NAME_LENGTH} caracteres.` };
}

/**
 * Primeira "letra" do nome para o avatar, em maiúscula. Usa o primeiro grafema, não `charAt(0)`: com um emoji ou
 * uma letra acentuada decomposta, `charAt(0)` entregaria metade de um caractere.
 */
export function displayInitial(name: string): string {
  const text = name.trim();
  if (text === "") return "?";
  const first =
    typeof Intl.Segmenter === "function"
      ? (new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(text)[Symbol.iterator]().next().value?.segment ?? "")
      : (Array.from(text)[0] ?? "");
  return first.normalize("NFC").toLocaleUpperCase("pt-BR") || "?";
}
