import { describe, expect, it } from "vitest";
import {
  DAY_PART_LABEL,
  DEFAULT_WATER_PORTIONS,
  FUTURE_WATER_ERROR,
  INVALID_WATER_ML,
  MAX_DAILY_GOAL_ML,
  MAX_WATER_ML,
  STALE_WATER_ERROR,
  WATER_FUTURE_TOLERANCE_MS,
  dayPartOf,
  dayRhythm,
  expectedWaterMl,
  formatLiters,
  formatTotal,
  formatWaterParts,
  isBehindWaterPace,
  latestIntake,
  litersInputText,
  parseLiters,
  parseWaterMl,
  portionsError,
  waterDay,
  waterDayTotals,
  waterGoalFor,
  waterIntakeError,
  waterIntakesOn,
  waterMlOn,
} from "./water";
import type { Goal, WaterIntake } from "./types";

// 07/10/2026 14:00 em São Paulo (quarta-feira; a semana é 05..11)
const NOW = Date.UTC(2026, 9, 7, 17, 0);
/** Instante de "dia + hora" em São Paulo (UTC-3, sem horário de verão). */
const at = (day: string, hour: number, minute = 0) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
const intake = (id: string, when: number, ml: number): WaterIntake => ({ id, at: when, ml });

describe("formatLiters", () => {
  it("abaixo de 1 L fica em ml; a partir daí em litros com vírgula e sem zeros à direita", () => {
    expect(formatLiters(0)).toBe("0 ml");
    expect(formatLiters(100)).toBe("100 ml");
    expect(formatLiters(850)).toBe("850 ml");
    expect(formatLiters(999)).toBe("999 ml");
    expect(formatLiters(1000)).toBe("1 L");
    expect(formatLiters(1500)).toBe("1,5 L");
    expect(formatLiters(1250)).toBe("1,25 L");
    expect(formatLiters(2500)).toBe("2,5 L");
    expect(formatLiters(1005)).toBe("1,005 L");
    expect(formatLiters(10_000)).toBe("10 L");
  });

  it("o total em destaque mostra o zero em litros, para casar com a unidade da meta ao lado", () => {
    expect(formatTotal(0)).toBe("0 L");
    expect(formatTotal(150)).toBe("150 ml");
    expect(formatTotal(1500)).toBe("1,5 L");
  });

  it("número e unidade separados (a gota mostra '+500' grande e 'ml' pequeno)", () => {
    expect(formatWaterParts(100)).toEqual({ value: "100", unit: "ml" });
    expect(formatWaterParts(500)).toEqual({ value: "500", unit: "ml" });
    expect(formatWaterParts(999)).toEqual({ value: "999", unit: "ml" });
    expect(formatWaterParts(1000)).toEqual({ value: "1", unit: "L" });
    expect(formatWaterParts(1500)).toEqual({ value: "1,5", unit: "L" });
    expect(formatWaterParts(2250)).toEqual({ value: "2,25", unit: "L" });
  });

  it("texto do campo de edição: sem separador de milhar", () => {
    expect(litersInputText(2500)).toBe("2,5");
    expect(litersInputText(2000)).toBe("2");
    expect(litersInputText(250)).toBe("0,25");
    expect(litersInputText(undefined)).toBe("");
  });
});

describe("parseLiters (meta diária digitada em litros)", () => {
  it("vazio é 'sem valor' e vírgula e ponto valem igual", () => {
    expect(parseLiters("")).toEqual({ ok: true, ml: null });
    expect(parseLiters("   ")).toEqual({ ok: true, ml: null });
    expect(parseLiters("2,5")).toEqual({ ok: true, ml: 2500 });
    expect(parseLiters("2.5")).toEqual({ ok: true, ml: 2500 });
    expect(parseLiters("2")).toEqual({ ok: true, ml: 2000 });
    expect(parseLiters("0,25")).toEqual({ ok: true, ml: 250 });
    expect(parseLiters(",5")).toEqual({ ok: true, ml: 500 });
    expect(parseLiters("1,234")).toEqual({ ok: true, ml: 1234 });
  });

  it("casas além do ml só passam se forem zeros: nunca arredonda em silêncio", () => {
    expect(parseLiters("2,5000")).toEqual({ ok: true, ml: 2500 });
    expect(parseLiters("2,5001")).toMatchObject({ ok: false, error: "Use no máximo 3 casas decimais (precisão de 1 ml)." });
  });

  it("entrada inválida vira erro, nunca outro número", () => {
    for (const bad of ["abc", "-1", "2,5 L", "2,,5", "1.000,5", ".", ","]) {
      expect(parseLiters(bad), bad).toMatchObject({ ok: false });
    }
    expect(parseLiters("0")).toMatchObject({ ok: false, error: "A quantidade deve ser maior que zero." });
    expect(parseLiters("0,000")).toMatchObject({ ok: false });
  });

  it("teto de 10 L", () => {
    expect(parseLiters("10")).toEqual({ ok: true, ml: MAX_DAILY_GOAL_ML });
    expect(parseLiters("10,001")).toMatchObject({ ok: false, error: "A meta diária pode ir até 10 L." });
    expect(parseLiters("11")).toMatchObject({ ok: false });
  });
});

describe("parseWaterMl (registro avulso em ml)", () => {
  it("só dígitos, de 1 a 5000", () => {
    expect(parseWaterMl("500")).toEqual({ ok: true, ml: 500 });
    expect(parseWaterMl(" 250 ")).toEqual({ ok: true, ml: 250 });
    expect(parseWaterMl("1")).toEqual({ ok: true, ml: 1 });
    expect(parseWaterMl("5000")).toEqual({ ok: true, ml: MAX_WATER_ML });
  });

  it("recusa vazio, zero, decimais, sinal, texto e acima do teto, com mensagem", () => {
    expect(parseWaterMl("")).toMatchObject({ ok: false, error: "Informe a quantidade em ml." });
    expect(parseWaterMl("0")).toMatchObject({ ok: false, error: "A quantidade deve ser maior que zero." });
    expect(parseWaterMl("5001")).toMatchObject({ ok: false, error: "Cada registro pode ter até 5 L." });
    for (const bad of ["5,5", "5.5", "-5", "abc", "5 ml", "1e3"]) {
      expect(parseWaterMl(bad), bad).toMatchObject({ ok: false, error: "Use apenas números inteiros, em ml." });
    }
  });
});

describe("portionsError", () => {
  it("os valores de fábrica são válidos", () => {
    expect(portionsError(DEFAULT_WATER_PORTIONS)).toBeNull();
    expect(portionsError([200, 500, 1000])).toBeNull();
  });

  it("exige três inteiros de 1 ml a 5 L, em ordem estritamente crescente", () => {
    expect(portionsError([100, 500])).toMatch(/três/);
    expect(portionsError([100, 500, 1000, 2000])).toMatch(/três/);
    expect(portionsError([0, 500, 1000])).toMatch(/de 1 ml a 5 L/);
    expect(portionsError([100, 500, 5001])).toMatch(/de 1 ml a 5 L/);
    expect(portionsError([100.5, 500, 1000])).toMatch(/de 1 ml a 5 L/);
    expect(portionsError([500, 100, 1000])).toMatch(/ordem crescente/);
    expect(portionsError([100, 100, 1000])).toMatch(/ordem crescente/);
    expect(portionsError([100, 1000, 1000])).toMatch(/ordem crescente/);
  });
});

describe("waterIntakeError: a regra que o reducer e o banco compartilham", () => {
  const ok = (when: number, ml = 500, now = NOW) => waterIntakeError({ at: when, ml }, now);

  it("quantidade: inteiro de 1 a 5000", () => {
    for (const ml of [0, -1, 1.5, Number.NaN, 5001]) expect(ok(NOW, ml), String(ml)).toBe(INVALID_WATER_ML);
    expect(ok(NOW, 1)).toBeNull();
    expect(ok(NOW, 5000)).toBeNull();
  });

  it("até 5 min no futuro vale (relógio do aparelho adiantado); além disso não", () => {
    expect(ok(NOW + WATER_FUTURE_TOLERANCE_MS)).toBeNull();
    expect(ok(NOW + WATER_FUTURE_TOLERANCE_MS + 1)).toBe(FUTURE_WATER_ERROR);
    expect(ok(NOW + 60 * 60_000)).toBe(FUTURE_WATER_ERROR);
  });

  it("só hoje e ontem, no fuso do app: o início de ontem vale, o último instante de anteontem não", () => {
    expect(ok(at("2026-10-06", 0, 0))).toBeNull();
    expect(ok(at("2026-10-05", 23, 59) + 59_999)).toBe(STALE_WATER_ERROR);
    expect(ok(at("2026-10-05", 12))).toBe(STALE_WATER_ERROR);
    expect(ok(at("2026-10-07", 0, 0))).toBeNull();
  });

  it("o fuso decide o dia: às 23h30 de SP (já dia seguinte em UTC) ontem ainda é 06/10", () => {
    const lateEvening = Date.UTC(2026, 9, 8, 2, 30); // 07/10 23:30 em SP; em UTC já é 08/10
    expect(ok(at("2026-10-06", 0, 0), 500, lateEvening)).toBeNull();
    expect(ok(at("2026-10-05", 23, 59), 500, lateEvening)).toBe(STALE_WATER_ERROR);
    expect(ok(lateEvening, 500, lateEvening)).toBeNull();
  });

  it("virada da meia-noite: às 00h30 de SP, 'ontem' passa a ser 07/10", () => {
    const afterMidnight = Date.UTC(2026, 9, 8, 3, 30); // 08/10 00:30 em SP
    expect(ok(at("2026-10-07", 0, 0), 500, afterMidnight)).toBeNull();
    expect(ok(at("2026-10-06", 23, 59), 500, afterMidnight)).toBe(STALE_WATER_ERROR);
  });

  it("a quantidade inválida vence o horário (a mesma ordem do banco)", () => {
    expect(ok(NOW + 24 * 3_600_000, 0)).toBe(INVALID_WATER_ML);
    expect(ok(at("2026-10-01", 12), 0)).toBe(INVALID_WATER_ML);
  });
});

describe("agregações por dia", () => {
  it("o dia vem do instante no fuso do app: um toque às 00h30 cai no dia novo e um às 23h30 no velho", () => {
    const late = intake("a", at("2026-10-06", 23, 30), 500);
    const early = intake("b", at("2026-10-07", 0, 30), 300);
    expect(waterDay(late)).toBe("2026-10-06");
    expect(waterDay(early)).toBe("2026-10-07");
    // em UTC os dois são do dia 07/10: a conta NÃO pode usar UTC
    expect(new Date(late.at).toISOString().slice(0, 10)).toBe("2026-10-07");
  });

  it("soma e conta por dia; dia sem registro é 0", () => {
    const list = [
      intake("a", at("2026-10-07", 8), 500),
      intake("b", at("2026-10-07", 12), 1000),
      intake("c", at("2026-10-06", 20), 100),
    ];
    const totals = waterDayTotals(list);
    expect(totals.get("2026-10-07")).toEqual({ ml: 1500, count: 2 });
    expect(totals.get("2026-10-06")).toEqual({ ml: 100, count: 1 });
    expect(waterMlOn(list, "2026-10-07")).toBe(1500);
    expect(waterMlOn(list, "2026-10-01")).toBe(0);
    expect(waterMlOn([], "2026-10-07")).toBe(0);
  });

  it("é memoizado na referência da lista: a Início e a tela dividem o custo, e uma lista nova recalcula", () => {
    const list = [intake("a", at("2026-10-07", 8), 500)];
    expect(waterDayTotals(list)).toBe(waterDayTotals(list));
    const next = [...list, intake("b", at("2026-10-07", 9), 250)];
    expect(waterDayTotals(next)).not.toBe(waterDayTotals(list));
    expect(waterDayTotals(next).get("2026-10-07")).toEqual({ ml: 750, count: 2 });
    expect(waterDayTotals(list).get("2026-10-07")).toEqual({ ml: 500, count: 1 }); // a antiga não mudou
  });

  it("os registros de um dia saem do mais antigo para o mais novo, com desempate pelo id", () => {
    const list = [
      intake("c", at("2026-10-07", 12), 1),
      intake("b", at("2026-10-07", 8), 1),
      intake("a", at("2026-10-07", 8), 1),
      intake("z", at("2026-10-06", 8), 1),
    ];
    expect(waterIntakesOn(list, "2026-10-07").map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(waterIntakesOn(list, "2026-10-05")).toEqual([]);
  });

  it("o registro mais recente (para o Desfazer)", () => {
    expect(latestIntake([])).toBeNull();
    const list = [intake("a", 100, 1), intake("c", 300, 1), intake("b", 300, 1), intake("d", 200, 1)];
    expect(latestIntake(list)?.id).toBe("c"); // empate no instante: o maior id
  });
});

describe("waterGoalFor: meta diária com vigência semanal", () => {
  const goals: Goal[] = [
    { id: "g1", kind: "water_ml", scopeId: null, validFrom: "2026-09-28", target: 2000 },
    { id: "g2", kind: "water_ml", scopeId: null, validFrom: "2026-10-05", target: 2500 },
    { id: "g3", kind: "running_meters", scopeId: null, validFrom: "2026-10-05", target: 20_000 },
  ];

  it("o mesmo valor vale para os sete dias da semana; a semana anterior mantém a meta antiga", () => {
    for (const day of ["2026-10-05", "2026-10-07", "2026-10-11"]) expect(waterGoalFor(goals, day), day).toBe(2500);
    for (const day of ["2026-09-28", "2026-10-04"]) expect(waterGoalFor(goals, day), day).toBe(2000);
  });

  it("sem meta (ou antes da primeira) é null; target 0 remove daí em diante", () => {
    expect(waterGoalFor([], "2026-10-07")).toBeNull();
    expect(waterGoalFor(goals, "2026-09-27")).toBeNull();
    const removed = [...goals, { id: "g4", kind: "water_ml", scopeId: null, validFrom: "2026-10-12", target: 0 } as Goal];
    expect(waterGoalFor(removed, "2026-10-14")).toBeNull();
    expect(waterGoalFor(removed, "2026-10-11")).toBe(2500);
  });

  it("não confunde com a meta de corrida", () => {
    expect(waterGoalFor([goals[2]], "2026-10-07")).toBeNull();
  });
});

describe("ritmo ao longo do dia (aviso dentro do app, sem push)", () => {
  const day = "2026-10-07";
  const clock = (hh: number, mm = 0) => at(day, hh, mm);

  it("o esperado sobe em linha reta das 7h às 22h e trava nas pontas", () => {
    expect(expectedWaterMl(3000, clock(6, 0))).toBe(0);
    expect(expectedWaterMl(3000, clock(7, 0))).toBe(0);
    expect(expectedWaterMl(3000, clock(14, 30))).toBe(1500); // metade do dia útil
    expect(expectedWaterMl(3000, clock(22, 0))).toBe(3000);
    expect(expectedWaterMl(3000, clock(23, 50))).toBe(3000);
  });

  it("usa o relógio de São Paulo, não o do aparelho nem o UTC", () => {
    // 17:30 UTC é 14:30 em São Paulo
    expect(expectedWaterMl(3000, Date.UTC(2026, 9, 7, 17, 30))).toBe(1500);
  });

  it("só avisa entre 14h e 22h, abaixo de 60% do esperado, com meta e sem tê-la batido", () => {
    // 18h: esperado 2200 (11/15 de 3000); 60% = 1320
    expect(isBehindWaterPace(1000, 3000, clock(18))).toBe(true);
    expect(isBehindWaterPace(1320, 3000, clock(18))).toBe(false); // exatamente 60%: ainda no ritmo
    expect(isBehindWaterPace(1319, 3000, clock(18))).toBe(true);
    expect(isBehindWaterPace(0, 3000, clock(13, 59))).toBe(false); // cedo demais para dizer
    expect(isBehindWaterPace(0, 3000, clock(14, 0))).toBe(true);
    expect(isBehindWaterPace(0, 3000, clock(21, 59))).toBe(true);
    expect(isBehindWaterPace(0, 3000, clock(22, 0))).toBe(false); // depois das 22h não insiste
  });

  it("sem meta ou com a meta batida nunca avisa", () => {
    expect(isBehindWaterPace(0, null, clock(18))).toBe(false);
    expect(isBehindWaterPace(0, 0, clock(18))).toBe(false);
    expect(isBehindWaterPace(3000, 3000, clock(18))).toBe(false);
    expect(isBehindWaterPace(5000, 3000, clock(18))).toBe(false);
  });
});

describe("partes do dia", () => {
  it("manhã 5h-12h, tarde 12h-18h, noite 18h-5h (no fuso de São Paulo)", () => {
    const part = (hh: number, mm = 0) => dayPartOf(at("2026-10-07", hh, mm));
    expect(part(4, 59)).toBe("night");
    expect(part(5, 0)).toBe("morning");
    expect(part(11, 59)).toBe("morning");
    expect(part(12, 0)).toBe("afternoon");
    expect(part(17, 59)).toBe("afternoon");
    expect(part(18, 0)).toBe("night");
    expect(part(23, 59)).toBe("night");
    expect(part(0, 0)).toBe("night");
    expect(Object.values(DAY_PART_LABEL)).toEqual(["Manhã", "Tarde", "Noite"]);
  });

  it("a madrugada de São Paulo é noite mesmo quando em UTC já é manhã", () => {
    expect(dayPartOf(Date.UTC(2026, 9, 7, 6, 30))).toBe("night"); // 03:30 em SP
    expect(dayPartOf(Date.UTC(2026, 9, 7, 9, 30))).toBe("morning"); // 06:30 em SP
  });
});

describe("dayRhythm: quando a água é bebida", () => {
  const today = "2026-10-30";
  const many = (specs: [string, number, number][]): WaterIntake[] =>
    specs.map(([d, hh, ml], i) => intake(`r${i}`, at(d, hh, 0), ml));
  const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-10-${String(29 - i).padStart(2, "0")}`);

  it("sem dados suficientes (poucos dias ou pouca água) não diz nada, mas ainda devolve os números", () => {
    const few = dayRhythm(many([["2026-10-29", 9, 500], ["2026-10-28", 9, 500]]), today);
    expect(few.insight).toBeNull();
    expect(few.totalMl).toBe(1000);
    expect(few.daysWithRecord).toBe(2);
    const little = dayRhythm(many(days(5).map((d): [string, number, number] => [d, 9, 100])), today);
    expect(little.insight).toBeNull();
    expect(dayRhythm([], today)).toMatchObject({ totalMl: 0, daysWithRecord: 0, insight: null });
  });

  it("as três partes somam 100% e a maior leva a frase 'Mais da metade'", () => {
    const list = many(days(6).flatMap((d): [string, number, number][] => [[d, 9, 1000], [d, 15, 400], [d, 21, 100]]));
    const rhythm = dayRhythm(list, today);
    expect(rhythm.parts.map((p) => p.part)).toEqual(["morning", "afternoon", "night"]);
    expect(rhythm.parts.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1, 10);
    expect(rhythm.parts[0].share).toBeCloseTo(1000 / 1500, 10);
    expect(rhythm.insight).toBe("Mais da metade da sua água vem de manhã.");
  });

  it("sem parte dominante mas com uma quase vazia: aponta a que falta", () => {
    const list = many(days(6).flatMap((d): [string, number, number][] => [[d, 9, 500], [d, 15, 450], [d, 21, 50]]));
    expect(dayRhythm(list, today).insight).toBe("Pouca água à noite: só 5% do total.");
  });

  it("bem distribuída: frase neutra", () => {
    const list = many(days(6).flatMap((d): [string, number, number][] => [[d, 9, 400], [d, 15, 400], [d, 21, 300]]));
    expect(dayRhythm(list, today).insight).toBe("Sua água está bem distribuída ao longo do dia.");
  });

  it("só olha os últimos 30 dias, hoje incluído, e ignora o que é depois de hoje", () => {
    const old = intake("old", at("2026-09-30", 9), 9999); // 31 dias atrás: fora
    const edge = intake("edge", at("2026-10-01", 9), 100); // 30 dias contando hoje: dentro
    const future = intake("future", at("2026-10-31", 9), 9999);
    const rhythm = dayRhythm([old, edge, future], today);
    expect(rhythm.totalMl).toBe(100);
    expect(rhythm.daysWithRecord).toBe(1);
  });
});

