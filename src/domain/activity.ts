import { daysInWeek, type DateKey } from "@/lib/dates";

/** Um dia da semana no indicador de atividade (as bolinhas de segunda a domingo). */
export interface WeekDot {
  date: DateKey;
  /** quantidade de registros do módulo no dia (treinos concluídos, corridas...) */
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Os sete dias da semana de `today`, cada um com quantos dos `dates` caem nele. Recebe só as datas: qualquer
 * módulo (musculação, corrida) alimenta o mesmo indicador sem este arquivo conhecer o tipo do registro.
 */
export function weekDotsFromDates(dates: readonly DateKey[], today: DateKey): WeekDot[] {
  return daysInWeek(today).map((date) => ({
    date,
    count: dates.filter((d) => d === date).length,
    isToday: date === today,
    isFuture: date > today,
  }));
}
