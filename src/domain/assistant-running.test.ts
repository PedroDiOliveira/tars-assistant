import { describe, expect, it } from "vitest";
import { answerQuestion } from "./assistant";
import { EMPTY_APP_DATA } from "./snapshot";
import type { DataSnapshot } from "./summary";
import type { RunningSession } from "./types";

const TODAY = "2026-10-07"; // quarta-feira; a semana é 05..11
const data = (runningSessions: RunningSession[], over: Partial<DataSnapshot> = {}): DataSnapshot => ({ ...EMPTY_APP_DATA, runningSessions, ...over });
const ask = (q: string, d: DataSnapshot) => answerQuestion(q, d, TODAY).text.replace(/[  ]/g, " ");

describe("assistente (simulação local): corrida", () => {
  it("'quanto corri nesta semana' usa o mesmo resumo da tela, separando informada de desconhecida", () => {
    const d = data([
      { id: "a", occurredOn: "2026-10-05", distanceMeters: 5000 },
      { id: "b", occurredOn: "2026-10-07", distanceMeters: 3000 },
      { id: "c", occurredOn: "2026-10-07" },
      { id: "velha", occurredOn: "2026-09-30", distanceMeters: 9000 },
    ]);
    expect(ask("Quanto corri nesta semana?", d)).toBe("Corrida (semana de 5 de out a 11 de out): 3 corridas em 2 dias, 8 km informados (1 corrida sem distância).");
  });

  it("sem nenhuma distância preenchida não diz '0 km'", () => {
    const text = ask("quanto corri esta semana", data([{ id: "a", occurredOn: "2026-10-06" }]));
    expect(text).toContain("1 corrida em 1 dia, sem distância preenchida");
    expect(text).not.toMatch(/\b0 km\b/);
  });

  it("sem corridas no período: diz que não há registros", () => {
    expect(ask("quanto corri esta semana", data([]))).toMatch(/Não há corridas registradas/);
  });

  it("no mês: soma só o mês consultado", () => {
    const d = data([{ id: "a", occurredOn: "2026-10-01", distanceMeters: 4000 }, { id: "b", occurredOn: "2026-09-20", distanceMeters: 99_000 }]);
    expect(ask("Quantos km corri neste mês?", d)).toContain("4 km informados");
  });

  it("a pergunta de treinos agora é explicitamente de musculação (corrida não entra)", () => {
    const d = data([{ id: "r", occurredOn: "2026-10-06", distanceMeters: 5000 }], {
      sessions: [{ id: "w1", planId: null, nameSnapshot: "A", startedAt: 1, finishedAt: 2, occurredOn: "2026-10-06", exercises: [] }],
    });
    const text = ask("Quantas vezes treinei nas últimas 4 semanas?", d);
    expect(text).toMatch(/musculação 1 vez/);
    expect(text).not.toMatch(/corri|km/);
  });

  it("o resumo da semana traz Musculação e Corrida em linhas separadas", () => {
    const d = data([{ id: "r", occurredOn: "2026-10-06", distanceMeters: 5000 }]);
    const text = ask("Como foi minha semana?", d);
    expect(text).toMatch(/Musculação: 0 treinos/);
    expect(text).toMatch(/Corrida: 1 corrida em 1 dia, 5 km informados\./);
  });
});
