import { CURRENCY, LOCALE } from "@/lib/constants";

const brl = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY });
const brlNoCents = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

/** Dinheiro vive em centavos inteiros; só vira reais na hora de exibir. */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Sem centavos quando o valor é redondo (R$ 1.500) e com centavos caso contrário. */
export function formatBRLCompact(cents: number): string {
  return cents % 100 === 0 ? brlNoCents.format(cents / 100) : brl.format(cents / 100);
}

/** Valor com sinal explícito: +R$ 10,00 / −R$ 10,00. */
export function formatSignedBRL(cents: number): string {
  if (cents === 0) return formatBRL(0);
  return `${cents > 0 ? "+" : "−"}${formatBRL(Math.abs(cents))}`;
}

const MAX_CENTS = 99_999_999_99;

/** Máscara de digitação estilo banco: só dígitos, preenchendo da direita (4 2 0 0 -> R$ 42,00). */
export function centsFromDigits(raw: string): number {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits === "") return 0;
  return Math.min(Number(digits), MAX_CENTS);
}

/** Aceita "42", "42,5", "1.234,56" e devolve centavos; null quando inválido. */
export function parseBRLToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[R$\s]/g, "");
  if (cleaned === "") return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** Centavos -> texto editável sem símbolo ("1500" -> "1.500,00"). */
export function centsToInputText(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
