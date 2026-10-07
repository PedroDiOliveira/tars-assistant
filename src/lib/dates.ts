import { TIMEZONE } from "./constants";

/**
 * Datas de negócio são strings "YYYY-MM-DD" (sem fuso) e instantes são epoch ms.
 * Toda aritmética de calendário usa UTC sobre a string, então nunca desloca um dia
 * por causa do fuso do aparelho. Só a conversão instante -> data usa o fuso do app.
 */
export type DateKey = string;
export type MonthKey = string;

export interface Period {
  start: DateKey;
  end: DateKey;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateKeyFromInstant(ms: number): DateKey {
  const parts = partsFormatter.formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayKey(nowMs: number = Date.now()): DateKey {
  return dateKeyFromInstant(nowMs);
}

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

/** Hora (0-23) no fuso do app, para saudação e horários. */
export function hourFromInstant(ms: number): number {
  return Number(hourFormatter.format(ms));
}

function parse(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toKey(date: Date): DateKey {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = parse(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

/** 0 = segunda ... 6 = domingo. */
export function weekdayIndex(key: DateKey): number {
  return (parse(key).getUTCDay() + 6) % 7;
}

export function weekStart(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key));
}

export function weekEnd(key: DateKey): DateKey {
  return addDays(weekStart(key), 6);
}

export function weekPeriod(key: DateKey): Period {
  return { start: weekStart(key), end: weekEnd(key) };
}

export function monthOf(key: DateKey): MonthKey {
  return key.slice(0, 7);
}

export function monthStart(month: MonthKey): DateKey {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): DateKey {
  const [y, m] = month.split("-").map(Number);
  return toKey(new Date(Date.UTC(y, m, 0)));
}

export function monthPeriod(month: MonthKey): Period {
  return { start: monthStart(month), end: monthEnd(month) };
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toKey(date).slice(0, 7);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

export function inPeriod(key: DateKey, period: Period): boolean {
  return key >= period.start && key <= period.end;
}

/** Dias que ainda restam na semana, contando hoje. Segunda = 7, domingo = 1. */
export function daysLeftInWeek(today: DateKey): number {
  return 7 - weekdayIndex(today);
}

export function daysInWeek(key: DateKey): DateKey[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toKey(parse(value)) === value;
}
