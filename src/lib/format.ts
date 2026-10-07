import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LOCALE } from "./constants";
import { addDays, type DateKey, type MonthKey } from "./dates";

/** Só para exibir: monta uma data local ao meio-dia a partir da chave, sem deslocar o dia. */
function display(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDayLong(key: DateKey): string {
  return format(display(key), "EEEE, d 'de' MMMM", { locale: ptBR });
}

export function formatDayShort(key: DateKey): string {
  return format(display(key), "d 'de' MMM", { locale: ptBR });
}

export function formatDayMonth(key: DateKey): string {
  return format(display(key), "dd/MM", { locale: ptBR });
}

export function formatDayRelative(key: DateKey, today: DateKey): string {
  if (key === today) return "Hoje";
  if (key === addDays(today, -1)) return "Ontem";
  return capitalize(format(display(key), "EEE, d 'de' MMM", { locale: ptBR }).replace(".", ""));
}

export function formatMonthLabel(month: MonthKey): string {
  return capitalize(format(display(`${month}-01`), "MMMM 'de' yyyy", { locale: ptBR }));
}

export function formatMonthName(month: MonthKey): string {
  return capitalize(format(display(`${month}-01`), "MMMM", { locale: ptBR }));
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

/** 80 -> "1h 20min"; 45 -> "45min"; 120 -> "2h". */
export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

/** Versão curta para espaços apertados (barras): 80 -> "1h20"; 45 -> "45m"; 120 -> "2h". */
export function formatMinutesCompact(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export function formatDurationSeconds(seconds: number): string {
  return formatMinutes(Math.floor(seconds / 60));
}

/** Relógio do cronômetro: mm:ss ou h:mm:ss. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatKg(kg: number): string {
  return `${formatNumber(kg, 2)} kg`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function greetingFor(hour: number): string {
  if (hour < 5) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
