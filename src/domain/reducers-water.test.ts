import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { applyCommand } from "./reducers";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import { dailyStreak } from "./streaks";
import { buildAttention } from "./attention";
import { bestDailyStreak } from "./streaks";
import { waterBestStreak, waterMonthSummary, waterTodaySummary, waterWeekStats } from "./summary";
import type { Goal, WaterIntake } from "./types";
import { FUTURE_WATER_ERROR, INVALID_WATER_ML, STALE_WATER_ERROR } from "./water";

const NOW = Date.UTC(2026, 9, 7, 17, 0); // 07/10/2026 14:00 em São Paulo (quarta; a semana é 05..11)
const TODAY = "2026-10-07";
const at = (day: string, hour: number, minute = 0) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);

function ok(data: AppData, command: Command): AppData {
  const applied = applyCommand(data, command);
  if (!applied.ok) throw new Error(`esperava sucesso, veio: ${applied.error}`);
  return applied.data;
}
const fail = (data: AppData, command: Command): string => {
  const applied = applyCommand(data, command);
  if (applied.ok) throw new Error("esperava falha");
  return applied.error;
};
const add = (intake: WaterIntake, nowMs = NOW): Command => ({ type: "water.add", intake, nowMs });
const remove = (id: string): Command => ({ type: "water.remove", id });

const empty: AppData = { ...EMPTY_APP_DATA };

describe("water.add", () => {
  it("cria um registro com id, instante e ml, sem campos extras", () => {
    const data = ok(empty, add({ id: "w1", at: NOW, ml: 500 }));
    expect(data.waterIntakes).toEqual([{ id: "w1", at: NOW, ml: 500 }]);
    expect(Object.keys(data.waterIntakes[0]).sort()).toEqual(["at", "id", "ml"]);
  });

  it("cada toque é um registro: vários toques seguidos somam", () => {
    let data = empty;
    for (let i = 0; i < 5; i += 1) data = ok(data, add({ id: `w${i}`, at: NOW - i * 1000, ml: 100 }));
    expect(data.waterIntakes).toHaveLength(5);
    expect(waterTodaySummary(data, TODAY).ml).toBe(500);
  });

  it("repetir o MESMO id (toque duplo, nova tentativa) não duplica nem altera o que já foi salvo", () => {
    const first = ok(empty, add({ id: "w1", at: NOW, ml: 500 }));
    const again = ok(first, add({ id: "w1", at: NOW - 1000, ml: 1000 }));
    expect(again.waterIntakes).toEqual([{ id: "w1", at: NOW, ml: 500 }]);
    expect(again).toBe(first); // nada mudou: mesma referência
  });

  it("recusa quantidade inválida, com a mesma mensagem do schema e do banco", () => {
    for (const ml of [0, -5, 1.5, 5001]) {
      expect(fail(empty, add({ id: "w", at: NOW, ml })), String(ml)).toBe(INVALID_WATER_ML);
    }
  });

  it("recusa horário no futuro (com 5 min de folga) e dia anterior a ontem", () => {
    expect(fail(empty, add({ id: "w", at: NOW + 6 * 60_000, ml: 500 }))).toBe(FUTURE_WATER_ERROR);
    ok(empty, add({ id: "w", at: NOW + 5 * 60_000, ml: 500 }));
    expect(fail(empty, add({ id: "w", at: at("2026-10-05", 12), ml: 500 }))).toBe(STALE_WATER_ERROR);
    ok(empty, add({ id: "w", at: at("2026-10-06", 8), ml: 500 }));
  });

  it("um registro recusado não deixa rastro", () => {
    const before: AppData = { ...empty, waterIntakes: [{ id: "w0", at: NOW - 1000, ml: 250 }] };
    expect(applyCommand(before, add({ id: "w1", at: NOW, ml: 0 })).ok).toBe(false);
    expect(before.waterIntakes).toHaveLength(1);
  });

  it("não mexe nas demais coleções (mesmas referências)", () => {
    const base: AppData = {
      ...empty,
      goals: [{ id: "g", kind: "workout_sessions", scopeId: null, validFrom: "2026-10-05", target: 4 }],
      runningSessions: [{ id: "r", occurredOn: TODAY, distanceMeters: 5000 }],
    };
    const data = ok(base, add({ id: "w1", at: NOW, ml: 500 }));
    for (const key of Object.keys(base).filter((k) => k !== "waterIntakes") as (keyof AppData)[]) expect(data[key]).toBe(base[key]);
  });
});

describe("water.remove", () => {
  it("remove só o registro do id", () => {
    let data = ok(empty, add({ id: "w1", at: NOW, ml: 500 }));
    data = ok(data, add({ id: "w2", at: NOW, ml: 250 }));
    data = ok(data, remove("w1"));
    expect(data.waterIntakes).toEqual([{ id: "w2", at: NOW, ml: 250 }]);
  });

  it("remover um id que não existe (desfazer depois de uma releitura) não é erro", () => {
    const data = ok(empty, remove("nao-existe"));
    expect(data.waterIntakes).toEqual([]);
  });

  it("remover duas vezes é o mesmo que remover uma", () => {
    const data = ok(empty, add({ id: "w1", at: NOW, ml: 500 }));
    expect(ok(ok(data, remove("w1")), remove("w1")).waterIntakes).toEqual([]);
  });

  it("não depende do relógio: dá para remover um registro antigo", () => {
    const old: AppData = { ...empty, waterIntakes: [{ id: "w1", at: at("2026-08-01", 10), ml: 500 }] };
    expect(ok(old, remove("w1")).waterIntakes).toEqual([]);
  });
});

describe("waterTodaySummary", () => {
  const goal = (target: number, validFrom = "2026-10-05"): Goal => ({ id: `g${validFrom}`, kind: "water_ml", scopeId: null, validFrom, target });
  const day = (d: string, mls: number[]): WaterIntake[] => mls.map((ml, i) => ({ id: `${d}-${i}`, at: at(d, 8 + i), ml }));

  it("sem meta: o contador funciona, sem divisão por zero nem percentual inventado", () => {
    const data: AppData = { ...empty, waterIntakes: day(TODAY, [500, 500]) };
    expect(waterTodaySummary(data, TODAY)).toMatchObject({ ml: 1000, count: 2, targetMl: null, ratio: 0, remainingMl: 0, overMl: 0, met: false, daysMet: 0 });
  });

  it("com meta: razão, quanto falta e meta batida", () => {
    const base: AppData = { ...empty, goals: [goal(2500)], waterIntakes: day(TODAY, [500, 1000]) };
    expect(waterTodaySummary(base, TODAY)).toMatchObject({ ml: 1500, targetMl: 2500, ratio: 0.6, remainingMl: 1000, overMl: 0, met: false });
    const done = { ...base, waterIntakes: day(TODAY, [1000, 1000, 500]) };
    expect(waterTodaySummary(done, TODAY)).toMatchObject({ ml: 2500, ratio: 1, remainingMl: 0, overMl: 0, met: true });
  });

  it("passar da meta é sucesso: razão fica em 1 e o excedente é informado", () => {
    const data: AppData = { ...empty, goals: [goal(2500)], waterIntakes: day(TODAY, [1000, 1000, 1000]) };
    expect(waterTodaySummary(data, TODAY)).toMatchObject({ ml: 3000, ratio: 1, overMl: 500, remainingMl: 0, met: true });
  });

  it("a semana (seg a dom) marca os dias na meta e só conta os que já passaram", () => {
    const data: AppData = {
      ...empty,
      goals: [goal(2000)],
      waterIntakes: [
        ...day("2026-10-05", [1000, 1000]), // seg: bate
        ...day("2026-10-06", [500]), // ter: não bate
        ...day(TODAY, [2000]), // qua (hoje): bate
        ...day("2026-10-09", [3000]), // sex (futuro, dado inesperado): não conta como dia na meta
      ],
    };
    const s = waterTodaySummary(data, TODAY);
    expect(s.week.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(s.week.map((d) => d.met)).toEqual([true, false, true, false, true, false, false]);
    expect(s.week[2]).toMatchObject({ isToday: true, isFuture: false });
    expect(s.week[3]).toMatchObject({ isFuture: true });
    expect(s.daysMet).toBe(2);
  });

  it("a meta antiga continua valendo para a semana antiga (o passado não é reescrito)", () => {
    const data: AppData = {
      ...empty,
      goals: [goal(2000, "2026-09-28"), goal(3000, "2026-10-05")],
      waterIntakes: [...day("2026-10-02", [2000]), ...day(TODAY, [2000])],
    };
    expect(waterTodaySummary(data, TODAY)).toMatchObject({ targetMl: 3000, met: false });
    expect(waterTodaySummary(data, "2026-10-02")).toMatchObject({ targetMl: 2000, met: true });
  });

  it("água não conta no que não é água: corrida e treino ficam intocados", () => {
    const data: AppData = { ...empty, waterIntakes: day(TODAY, [500]) };
    expect(data.runningSessions).toEqual([]);
    expect(data.sessions).toEqual([]);
  });
});

describe("dailyStreak", () => {
  const input = (values: Record<string, number>, target: number | null = 2000, today = TODAY) => ({
    today,
    valueForDay: (d: string) => values[d] ?? 0,
    targetForDay: () => target,
  });

  it("conta os dias seguidos; hoje entra se já bateu a meta", () => {
    expect(dailyStreak(input({ "2026-10-07": 2000, "2026-10-06": 2500, "2026-10-05": 2000, "2026-10-04": 100 }))).toEqual({ days: 3, todayMet: true });
  });

  it("hoje em andamento (ainda sem a meta) NÃO zera a sequência dos dias anteriores", () => {
    expect(dailyStreak(input({ "2026-10-07": 500, "2026-10-06": 2500, "2026-10-05": 2000 }))).toEqual({ days: 2, todayMet: false });
  });

  it("um dia ENCERRADO sem a meta interrompe a sequência", () => {
    expect(dailyStreak(input({ "2026-10-07": 2000, "2026-10-06": 1900, "2026-10-05": 2500 }))).toEqual({ days: 1, todayMet: true });
    expect(dailyStreak(input({ "2026-10-07": 0, "2026-10-06": 1999 }))).toEqual({ days: 0, todayMet: false });
  });

  it("sem meta não há sequência (e nunca divide por zero)", () => {
    expect(dailyStreak(input({ "2026-10-07": 5000 }, null))).toEqual({ days: 0, todayMet: false });
  });

  it("para na primeira lacuna de meta: dia anterior sem meta vigente interrompe", () => {
    const withGap = {
      today: TODAY,
      valueForDay: () => 3000,
      targetForDay: (d: string) => (d >= "2026-10-05" ? 2000 : null),
    };
    expect(dailyStreak(withGap)).toEqual({ days: 3, todayMet: true });
  });

  it("tem teto de dias (não varre o histórico inteiro)", () => {
    const always = { today: TODAY, valueForDay: () => 9999, targetForDay: () => 1, maxDays: 10 };
    expect(dailyStreak(always).days).toBe(11); // hoje + 10 anteriores
  });
});

describe("waterWeekStats", () => {
  const row = (date: string, ml: number, isFuture = false) => ({ date, ml, met: false, isToday: false, isFuture });

  it("média só dos dias decorridos COM registro; melhor dia; contagem de dias", () => {
    const stats = waterWeekStats([row("2026-10-05", 2000), row("2026-10-06", 0), row("2026-10-07", 3000), row("2026-10-08", 9999, true), row("2026-10-09", 0, true)]);
    expect(stats).toEqual({ averageMl: 2500, daysWithRecord: 2, best: { date: "2026-10-07", ml: 3000 } });
  });

  it("sem nenhum registro: sem média e sem melhor dia (nunca 0 inventado)", () => {
    expect(waterWeekStats([row("2026-10-05", 0), row("2026-10-06", 0)])).toEqual({ averageMl: null, daysWithRecord: 0, best: null });
    expect(waterWeekStats([])).toEqual({ averageMl: null, daysWithRecord: 0, best: null });
  });

  it("a média é arredondada a 10 ml (nunca '3,233 L') e um dia futuro com dado inesperado não entra", () => {
    expect(waterWeekStats([row("2026-10-05", 2500), row("2026-10-06", 2600), row("2026-10-07", 4600), row("2026-10-12", 5000, true)]).averageMl).toBe(3230);
    expect(waterWeekStats([row("2026-10-05", 1000), row("2026-10-06", 1011)]).averageMl).toBe(1010);
    expect(waterWeekStats([row("2026-10-05", 1000), row("2026-10-06", 1009)]).averageMl).toBe(1000);
  });

  it("empate no melhor dia fica com o primeiro", () => {
    expect(waterWeekStats([row("2026-10-05", 2000), row("2026-10-06", 2000)]).best?.date).toBe("2026-10-05");
  });
});

describe("waterMonthSummary: o calendário do mês", () => {
  const goal = (target: number, validFrom: string): Goal => ({ id: `g-${validFrom}`, kind: "water_ml", scopeId: null, validFrom, target });
  const dayMl = (d: string, ml: number): WaterIntake => ({ id: `w-${d}`, at: at(d, 10), ml });
  const base = (intakes: WaterIntake[], goals: Goal[] = [goal(2000, "2026-09-28")]): AppData => ({ ...EMPTY_APP_DATA, goals, waterIntakes: intakes });
  const flat = (m: ReturnType<typeof waterMonthSummary>) => m.weeks.flat().filter((c) => c !== null);

  it("semanas de segunda a domingo, com os dias de fora do mês em branco (outubro de 2026 começa numa quinta)", () => {
    const m = waterMonthSummary(base([]), "2026-10", "2026-10-14");
    expect(m.weeks.every((w) => w.length === 7)).toBe(true);
    expect(m.weeks[0].map((c) => c?.date ?? null)).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(flat(m)).toHaveLength(31);
    expect(m.weeks.at(-1)!.at(-1)).toBeNull(); // 31/10 é sábado: o domingo é de novembro
    expect(m.weeks).toHaveLength(5);
  });

  it("nível 0 sem registro, 1 abaixo da metade da meta, 2 até a meta e 3 com a meta batida", () => {
    const m = waterMonthSummary(base([dayMl("2026-10-05", 900), dayMl("2026-10-06", 1000), dayMl("2026-10-07", 1999), dayMl("2026-10-08", 2000), dayMl("2026-10-09", 5000)]), "2026-10", "2026-10-14");
    const level = (d: string) => flat(m).find((c) => c!.date === d)!.level;
    expect([level("2026-10-04"), level("2026-10-05"), level("2026-10-06"), level("2026-10-07"), level("2026-10-08"), level("2026-10-09")]).toEqual([0, 1, 2, 2, 3, 3]);
  });

  it("sem meta só existe 'bebeu' (nível 2), nunca 'meta batida'", () => {
    const m = waterMonthSummary(base([dayMl("2026-10-05", 100), dayMl("2026-10-06", 9000)], []), "2026-10", "2026-10-14");
    const cells = flat(m);
    expect(cells.find((c) => c!.date === "2026-10-05")).toMatchObject({ level: 2, met: false, targetMl: null });
    expect(cells.find((c) => c!.date === "2026-10-06")).toMatchObject({ level: 2, met: false });
    expect(m.daysMet).toBe(0);
  });

  it("totais do mês: só dias decorridos; média só dos dias com registro, a 10 ml", () => {
    const m = waterMonthSummary(base([dayMl("2026-10-05", 2000), dayMl("2026-10-06", 1000), dayMl("2026-10-07", 2500), dayMl("2026-10-20", 9000)]), "2026-10", "2026-10-14");
    expect(m).toMatchObject({ daysMet: 2, daysWithRecord: 3, totalMl: 5500, averageMl: 1830 });
    expect(flat(m).find((c) => c!.date === "2026-10-20")).toMatchObject({ isFuture: true });
    expect(flat(m).find((c) => c!.date === "2026-10-14")).toMatchObject({ isToday: true });
  });

  it("mês sem registro: média null (nunca 0 inventado)", () => {
    expect(waterMonthSummary(base([]), "2026-09", "2026-10-14")).toMatchObject({ daysMet: 0, daysWithRecord: 0, totalMl: 0, averageMl: null });
  });

  it("a meta de cada dia vem da vigência dele: a antiga fica nas semanas antigas", () => {
    const m = waterMonthSummary(base([dayMl("2026-10-02", 2000), dayMl("2026-10-07", 2000)], [goal(2000, "2026-09-28"), goal(3000, "2026-10-05")]), "2026-10", "2026-10-14");
    expect(flat(m).find((c) => c!.date === "2026-10-02")).toMatchObject({ targetMl: 2000, met: true });
    expect(flat(m).find((c) => c!.date === "2026-10-07")).toMatchObject({ targetMl: 3000, met: false, level: 2 });
  });

  it("fevereiro de ano comum com 28 dias que começa numa segunda: 4 semanas exatas", () => {
    const m = waterMonthSummary(base([]), "2027-02", "2027-02-10");
    expect(m.weeks).toHaveLength(4);
    expect(flat(m)).toHaveLength(28);
  });
});

describe("bestDailyStreak / waterBestStreak", () => {
  const values = (map: Record<string, number>) => (d: string) => map[d] ?? 0;

  it("a maior sequência da história, não só a atual", () => {
    const best = bestDailyStreak({ from: "2026-10-01", to: "2026-10-10", valueForDay: values({ "2026-10-01": 2, "2026-10-02": 2, "2026-10-03": 2, "2026-10-04": 0, "2026-10-05": 2, "2026-10-06": 2 }), targetForDay: () => 2 });
    expect(best).toBe(3);
  });

  it("hoje em andamento sem a meta não zera nem conta; hoje com a meta conta", () => {
    const run = { "2026-10-08": 2, "2026-10-09": 2 };
    expect(bestDailyStreak({ from: "2026-10-01", to: "2026-10-10", valueForDay: values(run), targetForDay: () => 2 })).toBe(2);
    expect(bestDailyStreak({ from: "2026-10-01", to: "2026-10-10", valueForDay: values({ ...run, "2026-10-10": 2 }), targetForDay: () => 2 })).toBe(3);
  });

  it("dia sem meta interrompe; sem nenhuma meta é 0", () => {
    expect(bestDailyStreak({ from: "2026-10-01", to: "2026-10-05", valueForDay: () => 9, targetForDay: (d) => (d === "2026-10-03" ? null : 1) })).toBe(2);
    expect(bestDailyStreak({ from: "2026-10-01", to: "2026-10-05", valueForDay: () => 9, targetForDay: () => null })).toBe(0);
  });

  it("não varre além do teto de dias", () => {
    expect(bestDailyStreak({ from: "2000-01-01", to: "2026-10-05", valueForDay: () => 9, targetForDay: () => 1, maxDays: 30 })).toBe(30);
  });

  it("sobre os dados do app: começa na data do primeiro registro e é 0 sem registros", () => {
    const goals: Goal[] = [{ id: "g", kind: "water_ml", scopeId: null, validFrom: "2026-09-28", target: 1000 }];
    const day = (d: string, ml: number): WaterIntake => ({ id: d, at: at(d, 10), ml });
    const data: AppData = { ...EMPTY_APP_DATA, goals, waterIntakes: [day("2026-10-01", 1000), day("2026-10-02", 1500), day("2026-10-03", 200), day("2026-10-04", 1000), day("2026-10-05", 1000), day("2026-10-06", 1000)] };
    expect(waterBestStreak(data, TODAY)).toBe(3);
    expect(waterBestStreak({ ...EMPTY_APP_DATA, goals }, TODAY)).toBe(0);
  });
});

describe("buildAttention: aviso de ritmo da água", () => {
  const goals: Goal[] = [{ id: "g", kind: "water_ml", scopeId: null, validFrom: "2026-10-05", target: 3000 }];
  const dataWith = (ml: number): AppData => ({ ...EMPTY_APP_DATA, goals, waterIntakes: ml > 0 ? [{ id: "w", at: at(TODAY, 8), ml }] : [] });
  const waterItems = (data: AppData, nowMs?: number) => buildAttention(data, TODAY, 10, nowMs).filter((i) => i.module === "water");

  it("atrás do ritmo às 18h: um aviso informativo (nunca vermelho) que leva à tela de água", () => {
    const items = waterItems(dataWith(500), at(TODAY, 18));
    expect(items).toEqual([{ id: "water-pace", tone: "info", module: "water", text: "Hoje você bebeu 500 ml de 3 L: faltam 2,5 L.", href: "/agua" }]);
  });

  it("no ritmo, cedo demais, tarde demais, sem meta ou sem a hora: nada", () => {
    expect(waterItems(dataWith(2500), at(TODAY, 18))).toEqual([]);
    expect(waterItems(dataWith(0), at(TODAY, 10))).toEqual([]);
    expect(waterItems(dataWith(0), at(TODAY, 22, 30))).toEqual([]);
    expect(waterItems({ ...dataWith(0), goals: [] }, at(TODAY, 18))).toEqual([]);
    expect(waterItems(dataWith(0), at(TODAY, 18))[0]?.text).toBe("Hoje você bebeu 0 L de 3 L: faltam 3 L."); // zero em litros, como o resto da tela
    expect(waterItems(dataWith(0))).toEqual([]); // quem não passa a hora nunca recebe o aviso (os outros chamadores não mudam)
  });
});

