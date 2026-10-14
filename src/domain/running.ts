import { dateKeyFromInstant, inPeriod, type DateKey, type Period } from "@/lib/dates";
import { LOCALE } from "@/lib/constants";
import { weekDotsFromDates, type WeekDot } from "./activity";
import type { RunningSession } from "./types";

/**
 * Corrida: um registro por corrida realizada, sempre manual. A distância é guardada em METROS inteiros
 * (5,25 km = 5250) e a duração em SEGUNDOS inteiros: nenhuma conta ou comparação usa ponto flutuante, então o
 * cadastro, a meta, o histórico e a Home nunca divergem por arredondamento.
 *
 * Distância e duração são opcionais: ausente = "não informado", nunca zero. Uma corrida sem distância continua
 * sendo uma corrida e marca o dia, mas não soma quilômetros.
 */

export const METERS_PER_KM = 1000;
/** Teto de uma corrida (500 km): barra erro de digitação como 5000 em vez de 5. */
export const MAX_DISTANCE_METERS = 500_000;
/** Teto de uma corrida (24 h), o mesmo de uma sessão de estudo. */
export const MAX_RUN_SECONDS = 24 * 60 * 60;
export const MAX_RUN_NOTES = 200;
/** Teto da meta semanal (1.000 km). */
export const MAX_WEEKLY_GOAL_METERS = 1_000_000;

export const FUTURE_RUN_ERROR = "Não é possível registrar uma corrida em uma data futura.";
export const RUN_NOT_FOUND = "Corrida não encontrada.";

/* ---------- distância: texto <-> metros ---------- */

export type DistanceParse = { ok: true; meters: number | null } | { ok: false; error: string };

/** Dígitos, no máximo um separador decimal (vírgula ou ponto) e mais dígitos. Nada de sinal, espaço ou "km". */
const DISTANCE_SHAPE = /^(\d*)(?:[.,](\d*))?$/;

/**
 * Lê a distância digitada, em km. Vazio = distância desconhecida (válido). Aceita "5,2" e "5.2".
 *
 * Entrada inválida NUNCA vira outro número: devolve o erro. Casas além dos metros (4ª em diante) só passam se
 * forem zeros (não mudam o valor); qualquer outro dígito é recusado em vez de arredondado em silêncio.
 * Sem separador de milhar: "1.000" é lido como 1 km (ponto decimal) e cairia no teto de 500 km se fosse mil.
 */
export function parseDistanceKm(input: string): DistanceParse {
  const text = input.trim();
  if (text === "") return { ok: true, meters: null };

  const match = DISTANCE_SHAPE.exec(text);
  const whole = match?.[1] ?? "";
  const fraction = match?.[2] ?? "";
  if (!match || (whole === "" && fraction === "")) {
    return { ok: false, error: "Distância inválida. Use números como 5,2 ou 5.2." };
  }
  if (/[^0]/.test(fraction.slice(3))) {
    return { ok: false, error: "Use no máximo 3 casas decimais (precisão de 1 metro)." };
  }

  const meters = Number(whole || "0") * METERS_PER_KM + Number(fraction.slice(0, 3).padEnd(3, "0"));
  if (meters <= 0) {
    return { ok: false, error: "A distância deve ser maior que zero. Deixe em branco se não souber." };
  }
  if (meters > MAX_DISTANCE_METERS) {
    return { ok: false, error: `A distância máxima por corrida é ${formatDistance(MAX_DISTANCE_METERS)}.` };
  }
  return { ok: true, meters };
}

/** Valor de `meters` em km, em pt-BR e sem a unidade: 5200 -> "5,2"; 800 -> "0,8"; 12500 -> "12,5"; 20000 -> "20". */
export function formatKm(meters: number): string {
  const whole = Math.floor(meters / METERS_PER_KM);
  const rest = meters % METERS_PER_KM;
  const wholeText = new Intl.NumberFormat(LOCALE).format(whole);
  if (rest === 0) return wholeText;
  return `${wholeText},${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}

/** "5,2 km". */
export function formatDistance(meters: number): string {
  return `${formatKm(meters)} km`;
}

/** Texto para o campo de edição: sem separador de milhar (o campo só aceita um separador decimal). 5250 -> "5,25". */
export function kmInputText(meters: number | undefined): string {
  if (meters === undefined) return "";
  const whole = Math.floor(meters / METERS_PER_KM);
  const rest = meters % METERS_PER_KM;
  return rest === 0 ? String(whole) : `${whole},${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}

/* ---------- duração ---------- */

export interface DurationParts {
  hours: string;
  minutes: string;
  seconds: string;
}

export type DurationParse = { ok: true; seconds: number | null } | { ok: false; error: string };

/** Lê horas, minutos e segundos digitados. Tudo vazio = duração desconhecida (válido). */
export function parseDuration(parts: DurationParts): DurationParse {
  const [hours, minutes, seconds] = [parts.hours, parts.minutes, parts.seconds].map((p) => p.trim());
  if (hours === "" && minutes === "" && seconds === "") return { ok: true, seconds: null };
  if ([hours, minutes, seconds].some((p) => p !== "" && !/^\d+$/.test(p))) {
    return { ok: false, error: "Use apenas números na duração." };
  }
  const [h, m, s] = [hours, minutes, seconds].map((p) => (p === "" ? 0 : Number(p)));
  if (m > 59) return { ok: false, error: "Os minutos vão de 0 a 59. Use o campo de horas para 1 hora ou mais." };
  if (s > 59) return { ok: false, error: "Os segundos vão de 0 a 59." };

  const total = h * 3600 + m * 60 + s;
  if (total <= 0) return { ok: false, error: "A duração deve ser maior que zero. Deixe em branco se não souber." };
  if (total > MAX_RUN_SECONDS) return { ok: false, error: "A duração máxima por corrida é de 24 horas." };
  return { ok: true, seconds: total };
}

/** Quebra a duração nos três campos do formulário; o que é zero fica vazio. */
export function durationParts(totalSeconds: number | undefined): DurationParts {
  if (totalSeconds === undefined) return { hours: "", minutes: "", seconds: "" };
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return {
    hours: h > 0 ? String(h) : "",
    minutes: m > 0 ? String(m) : "",
    seconds: s > 0 ? String(s) : "",
  };
}

/** 1800 -> "30min"; 3600 -> "1h"; 3900 -> "1h 05min"; 1815 -> "30min 15s"; 45 -> "45s". */
export function formatRunDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || (h > 0 && s > 0)) parts.push(h > 0 ? `${pad(m)}min` : `${m}min`);
  if (s > 0) parts.push(h > 0 || m > 0 ? `${pad(s)}s` : `${s}s`);
  return parts.join(" ") || "0s";
}

/* ---------- ritmo ---------- */

/**
 * Ritmo médio em segundos por km, calculado dos dados (nunca guardado). Sem distância ou sem duração não há
 * ritmo: devolve null em vez de inventar um.
 */
export function paceSecondsPerKm(distanceMeters: number | undefined, durationSeconds: number | undefined): number | null {
  if (!distanceMeters || !durationSeconds) return null;
  return Math.round((durationSeconds * METERS_PER_KM) / distanceMeters);
}

/** 360 -> "6:00 min/km". */
export function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = secondsPerKm % 60;
  return `${m}:${String(s).padStart(2, "0")} min/km`;
}

/** Ritmo de uma corrida já formatado, ou null quando falta distância ou duração. */
export function runPaceLabel(run: Pick<RunningSession, "distanceMeters" | "durationSeconds">): string | null {
  const pace = paceSecondsPerKm(run.distanceMeters, run.durationSeconds);
  return pace === null ? null : formatPace(pace);
}

/* ---------- agregações (todas puras; tela, Home e assistente usam estas) ---------- */

export function runsInPeriod(runs: RunningSession[], period: Period): RunningSession[] {
  return runs.filter((r) => inPeriod(r.occurredOn, period));
}

/** Quantidade de corridas = quantidade de registros. */
export function runCount(runs: RunningSession[]): number {
  return runs.length;
}

/** Dias com corrida = datas DISTINTAS. Duas corridas no mesmo dia contam um dia. */
export function runDayCount(runs: RunningSession[]): number {
  return new Set(runs.map((r) => r.occurredOn)).size;
}

/** Soma só das distâncias informadas, em metros. Corrida sem distância não soma nada. */
export function totalDistanceMeters(runs: RunningSession[]): number {
  return runs.reduce((sum, r) => sum + (r.distanceMeters ?? 0), 0);
}

/** Corridas sem distância informada (contam como corrida e marcam o dia, mas não somam km). */
export function runsWithoutDistanceCount(runs: RunningSession[]): number {
  return runs.filter((r) => r.distanceMeters === undefined).length;
}

export interface RunTotals {
  /** corridas (uma por registro) */
  runs: number;
  /** datas distintas com corrida */
  activeDays: number;
  /** soma das distâncias informadas, em metros */
  distanceMeters: number;
  /** corridas sem distância informada */
  runsWithoutDistance: number;
  /** alguma corrida tem distância? Sem isso, 0 km não é um total real: é desconhecido */
  hasDistance: boolean;
}

/** Os totais de um conjunto de corridas. Semana, período do assistente e histórico usam este mesmo cálculo. */
export function runTotals(runs: RunningSession[]): RunTotals {
  const runsWithoutDistance = runsWithoutDistanceCount(runs);
  return {
    runs: runCount(runs),
    activeDays: runDayCount(runs),
    distanceMeters: totalDistanceMeters(runs),
    runsWithoutDistance,
    hasDistance: runs.length - runsWithoutDistance > 0,
  };
}

/** Um indicador por dia da semana de `today`: marca qualquer corrida, com ou sem distância. */
export function runWeekDots(runs: RunningSession[], today: DateKey): WeekDot[] {
  return weekDotsFromDates(runs.map((r) => r.occurredOn), today);
}

/** Da mais recente para a mais antiga; no mesmo dia, pelo id (desempate estável: o mesmo em qualquer fonte de dados). */
export function sortRunsDesc(runs: RunningSession[]): RunningSession[] {
  return [...runs].sort((a, b) =>
    a.occurredOn !== b.occurredOn ? (a.occurredOn < b.occurredOn ? 1 : -1) : a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
  );
}

/* ---------- regras de um registro ---------- */

/** Mensagem de erro se a data for posterior a hoje (no fuso do app, a partir de `nowMs`); null se estiver ok. */
export function futureRunError(occurredOn: DateKey, nowMs: number): string | null {
  return occurredOn > dateKeyFromInstant(nowMs) ? FUTURE_RUN_ERROR : null;
}

/**
 * Campos de uma corrida na forma canônica: sem chaves `undefined` e sem observação vazia, igual ao que o banco
 * devolve. Assim o estado do reducer e o do snapshot são idênticos, campo a campo.
 */
export function normalizeRunFields(fields: Omit<RunningSession, "id">): Omit<RunningSession, "id"> {
  return {
    occurredOn: fields.occurredOn,
    ...(fields.distanceMeters !== undefined ? { distanceMeters: fields.distanceMeters } : {}),
    ...(fields.durationSeconds !== undefined ? { durationSeconds: fields.durationSeconds } : {}),
    ...(fields.notes ? { notes: fields.notes } : {}),
  };
}
