import { describe, expect, it } from "vitest";
import { applyCommand } from "./reducers";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import { waterBestStreak, waterMonthSummary, waterTodaySummary } from "./summary";
import type { WaterIntake } from "./types";
import { dayRhythm, waterDayTotals } from "./water";

/**
 * Escala: cinco anos de água, ~12 toques por dia (~22 mil registros). O snapshot carrega tudo (decisão 3), então
 * este teste fixa o custo que a decisão 27 aceitou e o limiar a partir do qual ela deve ser revista: agregar tem de
 * continuar baratinho e o backup de água tem de ficar muito abaixo de 1 MB por ano. Os tetos de tempo são folgados de
 * propósito (máquina de CI lenta); só pegam uma regressão de ordem de grandeza, como voltar a recalcular o dia de
 * cada registro a cada renderização.
 */

const TODAY = "2026-10-14";
const DAYS = 5 * 365;
const PER_DAY = 12;
const base = Date.parse(`${TODAY}T08:00:00-03:00`);

function fiveYears(): WaterIntake[] {
  const list: WaterIntake[] = [];
  for (let day = 0; day < DAYS; day += 1) {
    for (let tap = 0; tap < PER_DAY; tap += 1) {
      list.push({ id: `${day}-${tap}`, at: base - day * 86_400_000 + tap * 3_600_000 - 4 * 3_600_000, ml: tap % 3 === 0 ? 1000 : 250 });
    }
  }
  return list;
}

const timed = <T>(run: () => T): { value: T; ms: number } => {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
};

describe("água em escala (5 anos, ~22 mil registros)", () => {
  const intakes = fiveYears();
  const data: AppData = {
    ...EMPTY_APP_DATA,
    goals: [{ id: "g", kind: "water_ml", scopeId: null, validFrom: "2021-10-11", target: 3000 }],
    waterIntakes: intakes,
  };

  it("tem a ordem de grandeza esperada", () => {
    expect(intakes.length).toBe(DAYS * PER_DAY);
  });

  it("o backup de água de um ano fica bem abaixo de 1 MB (e o dos cinco anos abaixo de 3 MB)", () => {
    const perYear = JSON.stringify(intakes.slice(0, 365 * PER_DAY)).length;
    const total = JSON.stringify(intakes).length;
    expect(perYear).toBeLessThan(1_000_000);
    expect(total).toBeLessThan(3_000_000);
  });

  it("agregar o histórico inteiro pela primeira vez leva bem menos de um segundo", () => {
    const { value, ms } = timed(() => waterDayTotals(intakes));
    expect(value.size).toBeGreaterThanOrEqual(DAYS);
    expect(ms).toBeLessThan(1500);
  });

  it("a segunda leitura da mesma lista é instantânea (memoizada na referência)", () => {
    waterDayTotals(intakes);
    const { ms } = timed(() => waterDayTotals(intakes));
    expect(ms).toBeLessThan(5);
  });

  it("os resumos que a Início e a tela calculam a cada renderização são baratos com o histórico já agregado", () => {
    waterDayTotals(intakes);
    const today = timed(() => waterTodaySummary(data, TODAY));
    const month = timed(() => waterMonthSummary(data, "2026-09", TODAY));
    const best = timed(() => waterBestStreak(data, TODAY));
    const rhythm = timed(() => dayRhythm(intakes, TODAY));
    expect(today.ms).toBeLessThan(50);
    expect(month.ms).toBeLessThan(50);
    expect(best.ms).toBeLessThan(500);
    expect(rhythm.ms).toBeLessThan(1000);
    expect(today.value.ml).toBeGreaterThan(0);
  });

  it("um toque novo sobre o histórico inteiro custa pouco (o reducer copia a lista; o dia dos antigos não é recalculado)", () => {
    waterDayTotals(intakes);
    const now = Date.parse(`${TODAY}T15:00:00-03:00`);
    const { value, ms } = timed(() => applyCommand(data, { type: "water.add", intake: { id: "novo", at: now, ml: 500 }, nowMs: now }));
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    const recompute = timed(() => waterDayTotals(value.data.waterIntakes));
    expect(ms).toBeLessThan(100);
    // O dia de cada registro antigo já está guardado no próprio objeto: só o toque novo paga a conta do dia.
    expect(recompute.ms).toBeLessThan(500);
    expect(waterDayTotals(value.data.waterIntakes).get(TODAY)?.count).toBe((waterDayTotals(intakes).get(TODAY)?.count ?? 0) + 1);
  });
});
