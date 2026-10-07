import { addDays, monthOf, type DateKey } from "@/lib/dates";
import type { Category, TxType } from "./types";

export interface TxProposal {
  type: TxType;
  amountCents: number;
  description: string;
  occurredOn: DateKey;
  categoryId: string;
}

export type QuickEntryResult =
  | { kind: "proposal"; proposal: TxProposal }
  | { kind: "ask"; question: string }
  | { kind: "none" };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const INCOME_VERBS = ["recebi", "ganhei", "entrou", "depositaram"];
const EXPENSE_VERBS = ["gastei", "paguei", "comprei", "custou"];

/** Palavra-chave -> nome da categoria (o id é resolvido na lista real do usuário). */
const CATEGORY_KEYWORDS: { name: string; type: TxType; words: string[] }[] = [
  { name: "Salário", type: "income", words: ["salario", "pagamento", "holerite"] },
  {
    name: "Alimentação",
    type: "expense",
    words: ["outback", "restaurante", "almoco", "jantar", "lanche", "ifood", "mercado", "padaria", "cafe", "pizza", "hamburguer", "supermercado"],
  },
  {
    name: "Transporte",
    type: "expense",
    words: ["uber", "99", "gasolina", "combustivel", "onibus", "metro", "estacionamento", "pedagio"],
  },
  { name: "Moradia", type: "expense", words: ["aluguel", "condominio", "luz", "agua", "internet", "gas"] },
  { name: "Saúde", type: "expense", words: ["farmacia", "remedio", "medico", "dentista", "consulta", "exame"] },
  { name: "Lazer", type: "expense", words: ["cinema", "netflix", "spotify", "bar", "show", "viagem", "jogo"] },
  { name: "Compras", type: "expense", words: ["roupa", "tenis", "shopping", "amazon", "presente"] },
  { name: "Educação", type: "expense", words: ["curso", "livro", "faculdade", "mensalidade", "apostila"] },
];

function resolveCategory(text: string, type: TxType, categories: Category[]): string {
  const norm = normalize(text);
  const hit = CATEGORY_KEYWORDS.find(
    (k) => k.type === type && k.words.some((w) => new RegExp(`\\b${w}\\b`).test(norm)),
  );
  const byName = hit ? categories.find((c) => c.type === type && c.name === hit.name) : undefined;
  const fallback = categories.find((c) => c.type === type && c.name === "Outros");
  return (byName ?? fallback ?? categories.find((c) => c.type === type))?.id ?? "";
}

/** Acha valores monetários: "42", "42,50", "1.234,56", "R$ 3500". */
function findAmounts(text: string): number[] {
  const matches = text.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) ?? [];
  return matches
    .map((m) => {
      const normalized = m.includes(",") ? m.replace(/\./g, "").replace(",", ".") : m;
      return Math.round(Number(normalized) * 100);
    })
    .filter((cents) => Number.isFinite(cents) && cents > 0);
}

function resolveDate(text: string, today: DateKey): DateKey {
  const norm = normalize(text);
  if (/\banteontem\b/.test(norm)) return addDays(today, -2);
  if (/\bontem\b/.test(norm)) return addDays(today, -1);
  const day = norm.match(/\bdia (\d{1,2})\b/);
  if (day) {
    const n = Number(day[1]);
    if (n >= 1 && n <= 28) {
      const candidate = `${monthOf(today)}-${String(n).padStart(2, "0")}`;
      return candidate <= today ? candidate : today;
    }
  }
  return today;
}

function buildDescription(text: string, type: TxType): string {
  let desc = text
    .replace(/R\$\s*/gi, "")
    .replace(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g, " ")
    .replace(/\b(reais|real|hoje|ontem|anteontem|dia)\b/gi, " ")
    .replace(/\b(gastei|paguei|comprei|recebi|ganhei|custou)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  desc = desc.replace(/^(no|na|nos|nas|em|de|do|da|com|para|pro|pra|o|a|um|uma)\s+/i, "").trim();
  desc = desc.replace(/^(no|na|em|de|do|da)\s+/i, "").trim();
  if (!desc) return type === "income" ? "Receita" : "Despesa";
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}

/**
 * Interpretador local e simples, só para o protótipo. Na fase de IA entra um modelo,
 * mas o contrato é o mesmo: uma proposta editável que só é salva ao confirmar.
 */
export function parseQuickEntry(
  text: string,
  today: DateKey,
  categories: Category[],
): QuickEntryResult {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "none" };

  const norm = normalize(trimmed);
  const has = (words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(norm));
  // O verbo manda; "salário" sozinho só desempata para receita.
  const type: TxType | null = has(EXPENSE_VERBS)
    ? "expense"
    : has(INCOME_VERBS) || has(["salario"])
      ? "income"
      : null;
  if (!type) return { kind: "none" };

  const amounts = findAmounts(trimmed.replace(/\bdia \d{1,2}\b/gi, ""));
  if (amounts.length === 0) {
    return { kind: "ask", question: "Qual foi o valor? Informe, por exemplo: “42 reais”." };
  }
  if (amounts.length > 1) {
    return {
      kind: "ask",
      question: "Vi mais de um valor. Envie um lançamento por vez para eu conseguir registrar certo.",
    };
  }

  return {
    kind: "proposal",
    proposal: {
      type,
      amountCents: amounts[0],
      description: buildDescription(trimmed, type),
      occurredOn: resolveDate(trimmed, today),
      categoryId: resolveCategory(trimmed, type, categories),
    },
  };
}
