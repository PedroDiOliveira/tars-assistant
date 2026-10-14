import { describe, expect, it } from "vitest";
import { buildAttention } from "./attention";
import { goalFor } from "./goals";
import {
  durationParts,
  formatDistance,
  formatKm,
  formatPace,
  formatRunDuration,
  futureRunError,
  kmInputText,
  MAX_DISTANCE_METERS,
  MAX_RUN_SECONDS,
  normalizeRunFields,
  paceSecondsPerKm,
  parseDistanceKm,
  parseDuration,
  runCount,
  runDayCount,
  runPaceLabel,
  runsInPeriod,
  runsWithoutDistanceCount,
  runTotals,
  runWeekDots,
  sortRunsDesc,
  totalDistanceMeters,
} from "./running";
import { runningWeekText } from "./running-text";
import { EMPTY_APP_DATA } from "./snapshot";
import { runningWeekSummary, workoutSummary, type DataSnapshot } from "./summary";
import type { Goal, RunningSession } from "./types";

const run = (id: string, occurredOn: string, extra: Partial<RunningSession> = {}): RunningSession => ({ id, occurredOn, ...extra });
const meters = (text: string) => {
  const parsed = parseDistanceKm(text);
  if (!parsed.ok) throw new Error(`esperava válido: "${text}" -> ${parsed.error}`);
  return parsed.meters;
};
const error = (text: string) => {
  const parsed = parseDistanceKm(text);
  if (parsed.ok) throw new Error(`esperava erro: "${text}" -> ${parsed.meters}`);
  return parsed.error;
};

describe("distância: texto -> metros", () => {
  it("vazio é distância desconhecida (válido), não zero", () => {
    expect(meters("")).toBeNull();
    expect(meters("   ")).toBeNull();
  });

  it("5,2 e 5.2 dão o mesmo resultado: 5200 metros", () => {
    expect(meters("5,2")).toBe(5200);
    expect(meters("5.2")).toBe(5200);
    expect(meters(" 5,2 ")).toBe(5200);
  });

  it("converte com precisão de metros: 5 km, 5,25 km, 0,8 km, 1 m", () => {
    expect(meters("5")).toBe(5000);
    expect(meters("5,25")).toBe(5250);
    expect(meters("0,8")).toBe(800);
    expect(meters("0,001")).toBe(1);
    expect(meters("12,5")).toBe(12_500);
    expect(meters("42,195")).toBe(42_195);
  });

  it("aceita formas parciais sem mudar o valor: ',5' e '5,' ", () => {
    expect(meters(",5")).toBe(500);
    expect(meters("5,")).toBe(5000);
  });

  it("não usa ponto flutuante: valores que o float erraria ficam exatos", () => {
    // 1,005 * 1000 = 1004.9999999999999 em float; em inteiros é 1005
    expect(meters("1,005")).toBe(1005);
    expect(meters("4,35")).toBe(4350);
    expect(meters("0,29")).toBe(290);
  });

  it("casas além do metro: zeros passam (não mudam o valor); qualquer outro dígito é RECUSADO, nunca arredondado", () => {
    expect(meters("5,2000")).toBe(5200);
    expect(error("5,2345")).toMatch(/no máximo 3 casas decimais/);
    expect(error("5,0001")).toMatch(/no máximo 3 casas decimais/);
    expect(error("0,0005")).toMatch(/no máximo 3 casas decimais/);
  });

  it("zero é recusado (a distância desconhecida se deixa em branco)", () => {
    for (const text of ["0", "0,0", "0.000", "00", ",0", "0,0000"]) expect(error(text)).toMatch(/maior que zero/);
  });

  it("negativo, malformado e com texto são recusados em vez de virarem outro número", () => {
    for (const text of ["-5", "+5", "abc", "5km", "5 km", "5,2,3", "5..2", "1.000,5", "1,000.5", ".", ",", "5 2", "٥", "1e3", "NaN", "Infinity"]) {
      expect(error(text), text).toMatch(/Distância inválida/);
    }
  });

  it("12,5 não vira 125 (o separador nunca é descartado)", () => {
    expect(meters("12,5")).toBe(12_500);
    expect(meters("12,5")).not.toBe(125_000);
  });

  it("o teto de uma corrida é 500 km; acima disso recusa, com ou sem precisão perdida", () => {
    expect(meters("500")).toBe(MAX_DISTANCE_METERS);
    expect(error("500,001")).toMatch(/máxima por corrida é 500 km/);
    expect(error("5000")).toMatch(/máxima/);
    expect(error("99999999999999999999")).toMatch(/máxima/);
  });

  it("ida e volta: texto de edição -> metros devolve o mesmo valor, para qualquer valor possível", () => {
    for (let m = 1; m <= 5000; m += 7) expect(meters(kmInputText(m))).toBe(m);
    for (const m of [1, 10, 100, 999, 1000, 1001, 5250, 12_500, 42_195, 499_999, MAX_DISTANCE_METERS]) {
      expect(meters(kmInputText(m))).toBe(m);
    }
    expect(kmInputText(undefined)).toBe("");
  });
});

describe("distância: metros -> texto pt-BR", () => {
  it("formata sem casas supérfluas", () => {
    expect(formatKm(5200)).toBe("5,2");
    expect(formatKm(5000)).toBe("5");
    expect(formatKm(800)).toBe("0,8");
    expect(formatKm(12_500)).toBe("12,5");
    expect(formatKm(5250)).toBe("5,25");
    expect(formatKm(1)).toBe("0,001");
    expect(formatKm(1_234_000)).toBe("1.234");
    expect(formatDistance(5200)).toBe("5,2 km");
  });
});

describe("duração", () => {
  const dur = (hours: string, minutes: string, seconds: string) => parseDuration({ hours, minutes, seconds });

  it("tudo vazio é duração desconhecida (válido)", () => {
    expect(dur("", "", "")).toEqual({ ok: true, seconds: null });
    expect(dur(" ", "", "")).toEqual({ ok: true, seconds: null });
  });

  it("converte horas, minutos e segundos em segundos inteiros", () => {
    expect(dur("", "30", "")).toEqual({ ok: true, seconds: 1800 });
    expect(dur("1", "5", "30")).toEqual({ ok: true, seconds: 3930 });
    expect(dur("", "", "45")).toEqual({ ok: true, seconds: 45 });
    expect(dur("2", "", "")).toEqual({ ok: true, seconds: 7200 });
    expect(dur("24", "", "")).toEqual({ ok: true, seconds: MAX_RUN_SECONDS });
  });

  it("zero, acima de 24 h, minutos/segundos fora de 0–59 e texto são recusados", () => {
    expect(dur("0", "0", "0")).toMatchObject({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(dur("", "0", "")).toMatchObject({ ok: false });
    expect(dur("24", "0", "1")).toMatchObject({ ok: false, error: expect.stringMatching(/24 horas/) });
    expect(dur("25", "", "")).toMatchObject({ ok: false, error: expect.stringMatching(/24 horas/) });
    expect(dur("", "60", "")).toMatchObject({ ok: false, error: expect.stringMatching(/minutos vão de 0 a 59/i) });
    expect(dur("", "", "60")).toMatchObject({ ok: false, error: expect.stringMatching(/segundos vão de 0 a 59/i) });
    expect(dur("", "3a", "")).toMatchObject({ ok: false, error: expect.stringMatching(/apenas números/) });
    expect(dur("-1", "", "")).toMatchObject({ ok: false });
  });

  it("os campos de edição reproduzem o valor guardado", () => {
    for (const seconds of [1, 59, 60, 1800, 1815, 3600, 3930, 5400, MAX_RUN_SECONDS]) {
      expect(parseDuration(durationParts(seconds))).toEqual({ ok: true, seconds });
    }
    expect(durationParts(undefined)).toEqual({ hours: "", minutes: "", seconds: "" });
    expect(durationParts(3900)).toEqual({ hours: "1", minutes: "5", seconds: "" });
  });

  it("formata para a lista", () => {
    expect(formatRunDuration(1800)).toBe("30min");
    expect(formatRunDuration(3600)).toBe("1h");
    expect(formatRunDuration(3900)).toBe("1h 05min");
    expect(formatRunDuration(1815)).toBe("30min 15s");
    expect(formatRunDuration(3605)).toBe("1h 00min 05s");
    expect(formatRunDuration(45)).toBe("45s");
    expect(formatRunDuration(65)).toBe("1min 05s");
  });
});

describe("ritmo (calculado, nunca guardado)", () => {
  it("5 km em 30 minutos = 6:00 min/km", () => {
    expect(paceSecondsPerKm(5000, 1800)).toBe(360);
    expect(formatPace(360)).toBe("6:00 min/km");
    expect(runPaceLabel({ distanceMeters: 5000, durationSeconds: 1800 })).toBe("6:00 min/km");
  });

  it("arredonda para o segundo mais próximo", () => {
    expect(paceSecondsPerKm(5200, 1800)).toBe(346); // 346,15
    expect(formatPace(346)).toBe("5:46 min/km");
    expect(formatPace(305)).toBe("5:05 min/km");
  });

  it("sem distância ou sem duração não há ritmo", () => {
    expect(paceSecondsPerKm(undefined, 1800)).toBeNull();
    expect(paceSecondsPerKm(5000, undefined)).toBeNull();
    expect(runPaceLabel({ durationSeconds: 1800 })).toBeNull();
    expect(runPaceLabel({ distanceMeters: 5000 })).toBeNull();
    expect(runPaceLabel({})).toBeNull();
  });
});

describe("contagens: corridas, dias e distância são coisas diferentes", () => {
  const runs = [
    run("a", "2026-10-07", { distanceMeters: 3000 }),
    run("b", "2026-10-07", { distanceMeters: 5000 }),
    run("c", "2026-10-08"),
  ];

  it("2 corridas no mesmo dia = 2 corridas, 1 dia, 8 km; a corrida sem distância soma 0 e conta como corrida", () => {
    const same = runs.slice(0, 2);
    expect(runCount(same)).toBe(2);
    expect(runDayCount(same)).toBe(1);
    expect(totalDistanceMeters(same)).toBe(8000);
    expect(runTotals(runs)).toEqual({ runs: 3, activeDays: 2, distanceMeters: 8000, runsWithoutDistance: 1, hasDistance: true });
  });

  it("corrida sem distância marca o dia e não soma distância", () => {
    const only = [run("c", "2026-10-08")];
    expect(runTotals(only)).toEqual({ runs: 1, activeDays: 1, distanceMeters: 0, runsWithoutDistance: 1, hasDistance: false });
    expect(runsWithoutDistanceCount(only)).toBe(1);
  });

  it("filtra por período inclusive nas pontas", () => {
    const all = [run("1", "2026-10-04"), run("2", "2026-10-05"), run("3", "2026-10-11"), run("4", "2026-10-12")];
    expect(runsInPeriod(all, { start: "2026-10-05", end: "2026-10-11" }).map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("os indicadores da semana marcam qualquer corrida, inclusive sem distância", () => {
    const dots = runWeekDots(runs, "2026-10-09"); // sexta; semana 05..11
    expect(dots.map((d) => d.count)).toEqual([0, 0, 2, 1, 0, 0, 0]);
    expect(dots[3]).toMatchObject({ date: "2026-10-08", count: 1, isToday: false, isFuture: false });
    expect(dots[4]).toMatchObject({ isToday: true });
    expect(dots[5]).toMatchObject({ isFuture: true });
  });

  it("ordena da mais recente para a mais antiga, com desempate estável pelo id, sem alterar a lista", () => {
    const input = [run("b", "2026-10-07"), run("z", "2026-10-09"), run("a", "2026-10-07"), run("c", "2026-10-07")];
    const snapshot = JSON.stringify(input);
    const sorted = sortRunsDesc(input).map((r) => r.id);
    expect(sorted).toEqual(["z", "c", "b", "a"]);
    expect(sortRunsDesc([...input].reverse()).map((r) => r.id)).toEqual(sorted); // independe da ordem de entrada
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("data futura (fuso do app, não UTC)", () => {
  it("23h30 em São Paulo ainda é o dia anterior ao do UTC: hoje vale, amanhã não", () => {
    const now = Date.UTC(2026, 9, 15, 2, 30); // 14/10 23:30 em SP; 15/10 em UTC
    expect(futureRunError("2026-10-14", now)).toBeNull();
    expect(futureRunError("2026-10-15", now)).toMatch(/data futura/);
  });
  it("00h30 em São Paulo já é o dia seguinte", () => {
    const now = Date.UTC(2026, 9, 15, 3, 30);
    expect(futureRunError("2026-10-15", now)).toBeNull();
    expect(futureRunError("2026-10-16", now)).toMatch(/data futura/);
    expect(futureRunError("2026-10-01", now)).toBeNull();
  });
});

describe("forma canônica de um registro", () => {
  it("descarta chaves indefinidas e observação vazia (igual ao que o banco devolve)", () => {
    expect(normalizeRunFields({ occurredOn: "2026-10-07", distanceMeters: undefined, durationSeconds: undefined, notes: "" })).toEqual({ occurredOn: "2026-10-07" });
    const full = normalizeRunFields({ occurredOn: "2026-10-07", distanceMeters: 5200, durationSeconds: 1800, notes: "Parque" });
    expect(full).toEqual({ occurredOn: "2026-10-07", distanceMeters: 5200, durationSeconds: 1800, notes: "Parque" });
    expect(Object.keys(normalizeRunFields({ occurredOn: "2026-10-07", distanceMeters: undefined }))).toEqual(["occurredOn"]);
  });
});

/* ---------- resumo semanal, metas e integração com os demais módulos ---------- */

const TODAY = "2026-10-09"; // sexta-feira; a semana é 05..11
const goal = (id: string, validFrom: string, target: number, kind: Goal["kind"] = "running_meters"): Goal => ({ id, kind, scopeId: null, validFrom, target });
const snapshot = (over: Partial<DataSnapshot> = {}): DataSnapshot => ({ ...EMPTY_APP_DATA, ...over });

describe("resumo semanal de corrida", () => {
  it("exemplo da tela: 12,5 de 20 km, faltam 7,5 km, 3 corridas em 2 dias", () => {
    const data = snapshot({
      goals: [goal("g", "2026-10-05", 20_000)],
      runningSessions: [
        run("1", "2026-10-05", { distanceMeters: 5000, durationSeconds: 1800 }),
        run("2", "2026-10-07", { distanceMeters: 7500 }),
        run("3", "2026-10-07"),
      ],
    });
    const week = runningWeekSummary(data, TODAY);
    expect(week).toMatchObject({ runs: 3, activeDays: 2, distanceMeters: 12_500, runsWithoutDistance: 1, targetMeters: 20_000, remainingMeters: 7500, hasDistance: true });
    expect(week.ratio).toBeCloseTo(0.625);
    const text = runningWeekText(week);
    expect(text).toMatchObject({
      value: "12,5 de 20",
      unit: "km",
      goalLine: "Faltam 7,5 km",
      countsLine: "3 corridas · 2 dias com corrida",
      missingLine: "12,5 km informados · 1 corrida sem distância",
      showProgress: true,
    });
  });

  it("sem meta: mostra a distância informada e convida a definir a meta", () => {
    const data = snapshot({ runningSessions: [run("1", "2026-10-06", { distanceMeters: 5200 })] });
    const text = runningWeekText(runningWeekSummary(data, TODAY));
    expect(text).toMatchObject({ value: "5,2", unit: "km", goalLine: null, countsLine: "1 corrida · 1 dia com corrida", missingLine: null, showProgress: false });
  });

  it("todas sem distância: destaca as corridas e diz que a distância não foi preenchida (nunca '0 km')", () => {
    const data = snapshot({
      goals: [goal("g", "2026-10-05", 20_000)],
      runningSessions: [run("1", "2026-10-06"), run("2", "2026-10-08")],
    });
    const week = runningWeekSummary(data, TODAY);
    expect(week).toMatchObject({ runs: 2, distanceMeters: 0, hasDistance: false });
    const text = runningWeekText(week);
    expect(text).toMatchObject({ value: "2", unit: "corridas", goalLine: "Distância não preenchida · meta de 20 km", showProgress: false });
    expect(`${text.value} ${text.unit} ${text.goalLine} ${text.countsLine}`).not.toMatch(/\b0 km\b/);
  });

  it("sem nenhuma corrida: 0 é o total real", () => {
    const text = runningWeekText(runningWeekSummary(snapshot({ goals: [goal("g", "2026-10-05", 20_000)] }), TODAY));
    expect(text).toMatchObject({ value: "0 de 20", unit: "km", goalLine: "Faltam 20 km", countsLine: "Nenhuma corrida registrada" });
    expect(runningWeekText(runningWeekSummary(snapshot(), TODAY))).toMatchObject({ value: "0", unit: "corridas", goalLine: null });
  });

  it("meta batida: nada falta", () => {
    const data = snapshot({ goals: [goal("g", "2026-10-05", 10_000)], runningSessions: [run("1", "2026-10-05", { distanceMeters: 12_000 })] });
    const week = runningWeekSummary(data, TODAY);
    expect(week).toMatchObject({ remainingMeters: 0, ratio: 1 });
    expect(runningWeekText(week).goalLine).toBe("Meta da semana batida");
  });

  it("a semana começa na segunda e não inclui corridas de outras semanas", () => {
    const data = snapshot({
      runningSessions: [
        run("dom", "2026-10-04", { distanceMeters: 9000 }),
        run("seg", "2026-10-05", { distanceMeters: 1000 }),
        run("dom2", "2026-10-11", { distanceMeters: 2000 }),
        run("seg2", "2026-10-12", { distanceMeters: 4000 }),
      ],
    });
    expect(runningWeekSummary(data, TODAY)).toMatchObject({ runs: 2, distanceMeters: 3000 });
  });
});

describe("metas de corrida", () => {
  it("alterar a meta não reescreve as semanas anteriores (vigência)", () => {
    const goals = [goal("old", "2026-09-28", 15_000), goal("new", "2026-10-05", 25_000)];
    expect(goalFor(goals, "running_meters", null, "2026-09-28")?.target).toBe(15_000);
    expect(goalFor(goals, "running_meters", null, "2026-10-05")?.target).toBe(25_000);
    const data = snapshot({ goals });
    expect(runningWeekSummary(data, "2026-10-01").targetMeters).toBe(15_000); // semana passada
    expect(runningWeekSummary(data, TODAY).targetMeters).toBe(25_000);
  });

  it("meta 0 remove a meta daqui para a frente e preserva o passado", () => {
    const goals = [goal("a", "2026-09-28", 15_000), goal("off", "2026-10-05", 0)];
    expect(runningWeekSummary(snapshot({ goals }), TODAY).targetMeters).toBeNull();
    expect(runningWeekSummary(snapshot({ goals }), "2026-10-01").targetMeters).toBe(15_000);
  });

  it("a meta de corrida não é a de musculação, e vice-versa", () => {
    const data = snapshot({
      goals: [goal("run", "2026-10-05", 20_000), goal("wk", "2026-10-05", 4, "workout_sessions")],
      runningSessions: [run("1", "2026-10-06", { distanceMeters: 20_000 })],
    });
    expect(workoutSummary(data, TODAY)).toMatchObject({ done: 0, target: 4 }); // corrida não conta como treino
    expect(runningWeekSummary(data, TODAY)).toMatchObject({ targetMeters: 20_000, distanceMeters: 20_000 });
    const onlyWorkoutGoal = snapshot({ goals: [goal("wk", "2026-10-05", 4, "workout_sessions")], runningSessions: data.runningSessions });
    expect(runningWeekSummary(onlyWorkoutGoal, TODAY).targetMeters).toBeNull(); // sem meta de corrida
  });

  it("registrar corridas não depende de existir meta", () => {
    const week = runningWeekSummary(snapshot({ runningSessions: [run("1", "2026-10-06")] }), TODAY);
    expect(week).toMatchObject({ runs: 1, targetMeters: null, remainingMeters: 0, ratio: 0 });
  });
});

describe("sequência de semanas na meta de distância", () => {
  const weeks = ["2026-09-14", "2026-09-21", "2026-09-28"]; // segundas
  const hit = (start: string) => run(`r-${start}`, start, { distanceMeters: 20_000 });

  it("conta semanas seguidas pela meta de DISTÂNCIA e não pela de musculação", () => {
    const data = snapshot({
      goals: [goal("g", "2026-09-14", 20_000), goal("wk", "2026-09-14", 1, "workout_sessions")],
      runningSessions: weeks.map(hit),
    });
    expect(runningWeekSummary(data, TODAY).streak).toEqual({ weeks: 3, currentWeekMet: false });
    expect(workoutSummary(data, TODAY).streak.weeks).toBe(0);
  });

  it("a semana em andamento sem a meta ainda não interrompe a sequência; bater a meta soma", () => {
    const base = snapshot({ goals: [goal("g", "2026-09-14", 20_000)], runningSessions: weeks.map(hit) });
    expect(runningWeekSummary(base, TODAY).streak.weeks).toBe(3);
    const met = snapshot({ ...base, runningSessions: [...base.runningSessions, hit("2026-10-05")] });
    expect(runningWeekSummary(met, TODAY).streak).toEqual({ weeks: 4, currentWeekMet: true });
  });

  it("uma semana passada sem bater a meta (ou só com corridas sem distância) interrompe", () => {
    const data = snapshot({
      goals: [goal("g", "2026-09-14", 20_000)],
      runningSessions: [hit("2026-09-14"), run("sem", "2026-09-21"), hit("2026-09-28")],
    });
    expect(runningWeekSummary(data, TODAY).streak.weeks).toBe(1);
  });
});

describe("aviso da Home (objetivo, sem recomendar treino)", () => {
  const near = "2026-10-10"; // sábado: restam 2 dias
  const attention = (data: DataSnapshot, today = near) => buildAttention(data, today, 10).filter((i) => i.module === "running");

  it("diz quanto falta nos últimos dois dias da semana", () => {
    const data = snapshot({ goals: [goal("g", "2026-10-05", 20_000)], runningSessions: [run("1", "2026-10-06", { distanceMeters: 16_000 })] });
    expect(attention(data)).toEqual([
      { id: "running-pace", tone: "info", module: "running", text: "Faltam 4 km para sua meta semanal de corrida e 2 dias até domingo.", href: "/treino/corrida" },
    ]);
    expect(attention(data, "2026-10-07")).toEqual([]); // no meio da semana não avisa
  });

  it("meta batida vira um aviso de sucesso", () => {
    const data = snapshot({ goals: [goal("g", "2026-10-05", 10_000)], runningSessions: [run("1", "2026-10-06", { distanceMeters: 10_500 })] });
    expect(attention(data, "2026-10-07")[0]).toMatchObject({ id: "running-met", tone: "success", text: "Meta de corrida batida: 10,5 km de 10 km nesta semana." });
  });

  it("sem meta, ou só com corridas sem distância, não afirma quanto falta", () => {
    expect(attention(snapshot({ runningSessions: [run("1", "2026-10-06", { distanceMeters: 1000 })] }))).toEqual([]);
    const unknown = snapshot({ goals: [goal("g", "2026-10-05", 20_000)], runningSessions: [run("1", "2026-10-06")] });
    expect(attention(unknown)).toEqual([]);
  });
});
