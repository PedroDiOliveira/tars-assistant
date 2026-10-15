import { LOCALE } from "@/lib/constants";
import { addDays, clockFromInstant, dateKeyFromInstant, hourFromInstant, type DateKey } from "@/lib/dates";
import { currentWeekTarget } from "./goals";
import type { Goal, WaterIntake } from "./types";

/**
 * Água: um registro por toque no contador (`WaterIntake`), sempre em mililitros INTEIROS. O total do dia é a soma
 * dos registros do dia no fuso do app e nunca é guardado: a Início, a tela de água e o assistente leem o mesmo
 * cálculo, então não divergem. O dia vem do instante (`at`), então um toque às 00:30 cai no dia novo.
 */

/** Teto de um registro (5 L): barra erro de digitação como 5000 em vez de 500. */
export const MAX_WATER_ML = 5000;
/** Teto da meta diária (10 L). */
export const MAX_DAILY_GOAL_ML = 10_000;
/** Folga para o relógio do aparelho adiantado: um toque até 5 min "no futuro" ainda vale. */
export const WATER_FUTURE_TOLERANCE_MS = 5 * 60_000;

/** Copo, garrafa e garrafa grande. Editáveis nas preferências do aparelho; estes são os valores de fábrica. */
export type WaterPortions = readonly [number, number, number];
export const DEFAULT_WATER_PORTIONS: WaterPortions = [100, 500, 1000];
/** Índice da porção que nasce selecionada: a do meio (garrafa). */
export const DEFAULT_WATER_PORTION_INDEX = 1;

export const INVALID_WATER_ML = "Quantidade de água inválida.";
export const FUTURE_WATER_ERROR = "Horário no futuro.";
export const STALE_WATER_ERROR = "Só é possível registrar água de hoje e de ontem.";

/* ---------- texto <-> mililitros ---------- */

/** Litros em pt-BR, sem a unidade: 1500 -> "1,5"; 2000 -> "2"; 1250 -> "1,25"; 10000 -> "10". */
function literText(ml: number): string {
  const whole = Math.floor(ml / 1000);
  const rest = ml % 1000;
  const wholeText = new Intl.NumberFormat(LOCALE).format(whole);
  if (rest === 0) return wholeText;
  return `${wholeText},${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}

/** Número e unidade separados, para botões que mostram os dois em tamanhos diferentes ("+500" e "ml"). */
export function formatWaterParts(ml: number): { value: string; unit: "ml" | "L" } {
  return ml < 1000 ? { value: String(ml), unit: "ml" } : { value: literText(ml), unit: "L" };
}

/** "850 ml" abaixo de 1 L; a partir daí em litros ("1,5 L"). Zero é "0 ml". */
export function formatLiters(ml: number): string {
  const { value, unit } = formatWaterParts(ml);
  return `${value} ${unit}`;
}

/**
 * Total do dia como número de destaque: igual a `formatLiters`, mas o zero é "0 L" (e não "0 ml"), para o contador
 * vazio não parecer outra unidade que a da meta ao lado ("0 L de 2,5 L").
 */
export function formatTotal(ml: number): string {
  return ml === 0 ? "0 L" : formatLiters(ml);
}

/** Texto para o campo de edição (sem separador de milhar): 2500 -> "2,5". */
export function litersInputText(ml: number | undefined): string {
  if (ml === undefined) return "";
  const whole = Math.floor(ml / 1000);
  const rest = ml % 1000;
  return rest === 0 ? String(whole) : `${whole},${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}

export type LitersParse = { ok: true; ml: number | null } | { ok: false; error: string };

/** Dígitos, no máximo um separador decimal (vírgula ou ponto) e mais dígitos. Nada de sinal, espaço ou "L". */
const LITERS_SHAPE = /^(\d*)(?:[.,](\d*))?$/;

/**
 * Lê a meta diária digitada, em litros. Vazio = sem valor (válido). Aceita "2,5" e "2.5".
 *
 * Entrada inválida NUNCA vira outro número: devolve o erro. Casas além dos mililitros (4ª em diante) só passam se
 * forem zeros; qualquer outro dígito é recusado em vez de arredondado em silêncio.
 */
export function parseLiters(input: string): LitersParse {
  const text = input.trim();
  if (text === "") return { ok: true, ml: null };

  const match = LITERS_SHAPE.exec(text);
  const whole = match?.[1] ?? "";
  const fraction = match?.[2] ?? "";
  if (!match || (whole === "" && fraction === "")) {
    return { ok: false, error: "Quantidade inválida. Use números como 2,5 ou 2.5." };
  }
  if (/[^0]/.test(fraction.slice(3))) {
    return { ok: false, error: "Use no máximo 3 casas decimais (precisão de 1 ml)." };
  }

  const ml = Number(whole || "0") * 1000 + Number(fraction.slice(0, 3).padEnd(3, "0"));
  if (ml <= 0) return { ok: false, error: "A quantidade deve ser maior que zero." };
  if (ml > MAX_DAILY_GOAL_ML) {
    return { ok: false, error: `A meta diária pode ir até ${formatLiters(MAX_DAILY_GOAL_ML)}.` };
  }
  return { ok: true, ml };
}

export type MlParse = { ok: true; ml: number } | { ok: false; error: string };

/** Lê uma quantidade digitada em ml (só dígitos), para o registro avulso e para as porções. */
export function parseWaterMl(input: string): MlParse {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Informe a quantidade em ml." };
  if (!/^\d+$/.test(text)) return { ok: false, error: "Use apenas números inteiros, em ml." };
  const ml = Number(text);
  if (ml <= 0) return { ok: false, error: "A quantidade deve ser maior que zero." };
  if (ml > MAX_WATER_ML) return { ok: false, error: `Cada registro pode ter até ${formatLiters(MAX_WATER_ML)}.` };
  return { ok: true, ml };
}

/** As três porções são válidas? Inteiros de 1 ml a 5 L, em ordem estritamente crescente (copo < garrafa < grande). */
export function portionsError(portions: readonly number[]): string | null {
  if (portions.length !== 3) return "São três quantidades: copo, garrafa e garrafa grande.";
  if (portions.some((p) => !Number.isInteger(p) || p < 1 || p > MAX_WATER_ML)) {
    return `Cada quantidade vai de 1 ml a ${formatLiters(MAX_WATER_ML)}.`;
  }
  if (!(portions[0] < portions[1] && portions[1] < portions[2])) {
    return "Use quantidades em ordem crescente: copo, garrafa e garrafa grande.";
  }
  return null;
}

/* ---------- regras de um registro ---------- */

/**
 * Mensagem de erro se o registro não pode ser gravado agora; null se estiver ok. A MESMA regra (e as mesmas
 * mensagens) do gatilho do banco: quantidade válida, no máximo 5 min no futuro e dia de hoje ou de ontem no fuso
 * do app, a partir de `nowMs`.
 */
export function waterIntakeError(intake: Pick<WaterIntake, "at" | "ml">, nowMs: number): string | null {
  if (!Number.isInteger(intake.ml) || intake.ml < 1 || intake.ml > MAX_WATER_ML) return INVALID_WATER_ML;
  if (intake.at > nowMs + WATER_FUTURE_TOLERANCE_MS) return FUTURE_WATER_ERROR;
  if (dateKeyFromInstant(intake.at) < addDays(dateKeyFromInstant(nowMs), -1)) return STALE_WATER_ERROR;
  return null;
}

/* ---------- agregações (todas puras; Início, tela e assistente usam estas) ---------- */

export interface WaterDayTotal {
  ml: number;
  count: number;
}

/**
 * O dia de cada registro é calculado UMA vez (a conversão instante -> data usa `Intl`, que não é barata) e fica
 * guardado no próprio objeto: o reducer e o TanStack reaproveitam os registros que não mudaram, então um toque novo
 * só paga a conta do toque novo.
 */
const dayOfIntake = new WeakMap<WaterIntake, DateKey>();

export function waterDay(intake: WaterIntake): DateKey {
  let day = dayOfIntake.get(intake);
  if (day === undefined) {
    day = dateKeyFromInstant(intake.at);
    dayOfIntake.set(intake, day);
  }
  return day;
}

const totalsByList = new WeakMap<readonly WaterIntake[], Map<DateKey, WaterDayTotal>>();

/** Total e quantidade de registros por dia. Memoizado na referência da lista: a Início e a tela dividem o custo. */
export function waterDayTotals(intakes: readonly WaterIntake[]): ReadonlyMap<DateKey, WaterDayTotal> {
  const cached = totalsByList.get(intakes);
  if (cached) return cached;
  const totals = new Map<DateKey, WaterDayTotal>();
  for (const intake of intakes) {
    const day = waterDay(intake);
    const current = totals.get(day);
    if (current) {
      current.ml += intake.ml;
      current.count += 1;
    } else {
      totals.set(day, { ml: intake.ml, count: 1 });
    }
  }
  totalsByList.set(intakes, totals);
  return totals;
}

/** ml bebidos no dia (0 se não houve registro). */
export function waterMlOn(intakes: readonly WaterIntake[], day: DateKey): number {
  return waterDayTotals(intakes).get(day)?.ml ?? 0;
}

/** Registros de um dia, do mais antigo para o mais novo (no mesmo instante, pelo id: ordem estável em qualquer fonte). */
export function waterIntakesOn(intakes: readonly WaterIntake[], day: DateKey): WaterIntake[] {
  return intakes
    .filter((i) => waterDay(i) === day)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** O registro mais recente de todos (para o "Desfazer"), ou null. */
export function latestIntake(intakes: readonly WaterIntake[]): WaterIntake | null {
  let best: WaterIntake | null = null;
  for (const intake of intakes) {
    if (!best || intake.at > best.at || (intake.at === best.at && intake.id > best.id)) best = intake;
  }
  return best;
}

/**
 * Meta diária (ml por dia) vigente em `day`, ou null. A meta é guardada com vigência semanal (a partir de uma
 * segunda-feira): o mesmo valor vale para os sete dias da semana. É o ÚNICO ponto que sabe disso.
 */
export function waterGoalFor(goals: Goal[], day: DateKey): number | null {
  return currentWeekTarget(goals, "water_ml", null, day);
}

/* ---------- ritmo ao longo do dia ---------- */

/** O dia de água vai das 7h às 22h: é entre esses horários que a meta "deveria" ir sendo cumprida. */
export const WATER_DAY_START_HOUR = 7;
export const WATER_DAY_END_HOUR = 22;
/** O aviso de ritmo só aparece a partir das 14h (antes disso um total baixo não diz nada) e some às 22h. */
export const WATER_PACE_FROM_HOUR = 14;
/** "Atrás do ritmo" = menos de 60% do que seria esperado a esta hora. */
export const WATER_PACE_TOLERANCE = 0.6;

function minutesOfDay(ms: number): number {
  const [hours, minutes] = clockFromInstant(ms).split(":").map(Number);
  return hours * 60 + minutes;
}

/** Quanto da meta já "deveria" ter sido bebido a esta hora, em ml, subindo em linha reta das 7h às 22h. */
export function expectedWaterMl(targetMl: number, nowMs: number): number {
  const start = WATER_DAY_START_HOUR * 60;
  const end = WATER_DAY_END_HOUR * 60;
  const fraction = Math.min(Math.max((minutesOfDay(nowMs) - start) / (end - start), 0), 1);
  return Math.round(targetMl * fraction);
}

/** Entre 14h e 22h e com menos de 60% do esperado para a hora. Sem meta ou com a meta batida, nunca. */
export function isBehindWaterPace(ml: number, targetMl: number | null, nowMs: number): boolean {
  if (!targetMl || ml >= targetMl) return false;
  const hour = hourFromInstant(nowMs);
  if (hour < WATER_PACE_FROM_HOUR || hour >= WATER_DAY_END_HOUR) return false;
  return ml < expectedWaterMl(targetMl, nowMs) * WATER_PACE_TOLERANCE;
}

/* ---------- partes do dia ---------- */

export type DayPart = "morning" | "afternoon" | "night";

/** Manhã 5h-12h, tarde 12h-18h, noite 18h-5h. */
export function dayPartOf(ms: number): DayPart {
  const hour = hourFromInstant(ms);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

export const DAY_PART_LABEL: Record<DayPart, string> = { morning: "Manhã", afternoon: "Tarde", night: "Noite" };
const DAY_PART_PHRASE: Record<DayPart, string> = { morning: "de manhã", afternoon: "à tarde", night: "à noite" };

export interface DayPartShare {
  part: DayPart;
  ml: number;
  /** fração do total (0..1); a soma das três é 1 quando há água */
  share: number;
}

export interface DayRhythm {
  parts: DayPartShare[];
  totalMl: number;
  /** dias do período com pelo menos um registro */
  daysWithRecord: number;
  /** uma frase calculada, ou null quando ainda não há dados para dizer nada */
  insight: string | null;
}

/** Menos do que isto no período e a "distribuição" é só ruído de poucos goles. */
const MIN_RHYTHM_DAYS = 3;
const MIN_RHYTHM_ML = 3000;

/**
 * Quando a água é bebida: manhã, tarde e noite nos `days` dias que terminam em `today` (hoje incluído). Determinístico,
 * sem IA; a frase só aparece com dados suficientes.
 */
export function dayRhythm(intakes: readonly WaterIntake[], today: DateKey, days = 30): DayRhythm {
  const from = addDays(today, -(days - 1));
  const totals: Record<DayPart, number> = { morning: 0, afternoon: 0, night: 0 };
  const recorded = new Set<DateKey>();
  for (const intake of intakes) {
    const day = waterDay(intake);
    if (day < from || day > today) continue;
    totals[dayPartOf(intake.at)] += intake.ml;
    recorded.add(day);
  }
  const totalMl = totals.morning + totals.afternoon + totals.night;
  const order: DayPart[] = ["morning", "afternoon", "night"];
  const parts = order.map((part) => ({ part, ml: totals[part], share: totalMl > 0 ? totals[part] / totalMl : 0 }));

  let insight: string | null = null;
  if (recorded.size >= MIN_RHYTHM_DAYS && totalMl >= MIN_RHYTHM_ML) {
    const top = parts.reduce((a, b) => (b.share > a.share ? b : a));
    const low = parts.reduce((a, b) => (b.share < a.share ? b : a));
    if (top.share > 0.5) insight = `Mais da metade da sua água vem ${DAY_PART_PHRASE[top.part]}.`;
    else if (low.share < 0.15) insight = `Pouca água ${DAY_PART_PHRASE[low.part]}: só ${Math.round(low.share * 100)}% do total.`;
    else insight = "Sua água está bem distribuída ao longo do dia.";
  }
  return { parts, totalMl, daysWithRecord: recorded.size, insight };
}

