import { describe, expect, it, vi } from "vitest";
import type { Command, Outcome } from "@/domain/commands";
import { EMPTY_APP_DATA, type AppData } from "@/domain/snapshot";
import type { WorkoutDraft } from "@/domain/types";
import { createDataActions, type ActionHost } from "./actions";
import { fail, ok, type Result } from "./contract";

const NOW = Date.UTC(2026, 9, 7, 17, 0); // 07/10/2026 14:00 em São Paulo

const draftWith = (done: boolean): WorkoutDraft => ({
  id: "draft-1",
  planId: "plan-a",
  nameSnapshot: "Treino A",
  startedAt: NOW - 3_600_000,
  exercises: [
    {
      exerciseId: "ex-1",
      nameSnapshot: "Supino",
      loadType: "external",
      plannedSets: 1,
      repMin: 6,
      repMax: 10,
      restSeconds: 90,
      sets: [{ weightKg: 60, reps: 8, done }],
    },
  ],
});

function makeHost(initial: { data?: Partial<AppData>; draft?: WorkoutDraft | null } = {}) {
  let ids = 0;
  const state = { data: { ...EMPTY_APP_DATA, ...initial.data } as AppData, draft: initial.draft ?? null };
  const dispatched: Command[] = [];
  let respond: (command: Command) => Promise<Result<Outcome>> = async () => ok<Outcome>("saved");
  const host: ActionHost = {
    read: () => state,
    dispatch: vi.fn(async (command: Command) => {
      dispatched.push(command);
      return respond(command);
    }),
    clearDraft: vi.fn(() => {
      state.draft = null;
    }),
    now: () => NOW,
    newId: () => `id-${++ids}`,
  };
  return {
    host,
    dispatched,
    state,
    respondWith: (fn: typeof respond) => {
      respond = fn;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("lançamentos e entidades simples", () => {
  it("gera o id no cliente e marca a origem como manual por padrão", async () => {
    const { host, dispatched } = makeHost();
    const result = await createDataActions(host).addTransaction({
      type: "expense",
      amountCents: 4200,
      categoryId: "c",
      description: "Outback",
      occurredOn: "2026-10-07",
    });
    expect(result).toEqual(ok({ id: "id-1" }));
    expect(dispatched[0]).toMatchObject({
      type: "transaction.add",
      transaction: { id: "id-1", source: "manual", amountCents: 4200 },
    });
  });

  it("preserva a origem 'ai' quando informada", async () => {
    const { host, dispatched } = makeHost();
    await createDataActions(host).addTransaction({
      type: "expense", amountCents: 1, categoryId: "c", description: "", occurredOn: "2026-10-07", source: "ai",
    });
    expect(dispatched[0]).toMatchObject({ transaction: { source: "ai" } });
  });

  it("usa o id informado (proposta do assistente): confirmar de novo reenvia o mesmo lançamento", async () => {
    const { host, dispatched } = makeHost();
    const actions = createDataActions(host);
    const input = {
      id: "proposal-7", type: "expense" as const, amountCents: 4200, categoryId: "c",
      description: "Outback", occurredOn: "2026-10-07", source: "ai" as const,
    };
    expect(await actions.addTransaction(input)).toEqual(ok({ id: "proposal-7" }));
    await actions.addTransaction(input);
    expect(dispatched.map((c) => (c.type === "transaction.add" ? c.transaction.id : null))).toEqual([
      "proposal-7",
      "proposal-7",
    ]);
  });

  it("propaga a falha do dispatch sem inventar sucesso", async () => {
    const { host, respondWith } = makeHost();
    respondWith(async () => fail("Sem conexão. Não foi possível salvar.", "offline"));
    const result = await createDataActions(host).deleteTemplate("t");
    expect(result).toEqual({ ok: false, error: "Sem conexão. Não foi possível salvar.", code: "offline" });
  });

  it("matéria nova: nome aparado, matiz pela quantidade e id devolvido", async () => {
    const { host, dispatched } = makeHost({
      data: { subjects: [{ id: "s0", name: "SQL", hue: 100 }] },
    });
    const result = await createDataActions(host).addSubject("  Redes  ", "BB");
    expect(result).toEqual(ok({ id: "id-1" }));
    expect(dispatched[0]).toMatchObject({
      type: "subject.add",
      subject: { id: "id-1", name: "Redes", objective: "BB" },
    });
  });

  it("meta nova carrega um id e a vigência informada", async () => {
    const { host, dispatched } = makeHost();
    await createDataActions(host).setGoal({ kind: "savings", scopeId: null, validFrom: "2026-10-01", target: 50_000 });
    expect(dispatched[0]).toMatchObject({ type: "goal.set", goal: { id: "id-1", target: 50_000 } });
  });

  it("sessão de leitura inválida devolve a mensagem de validação", async () => {
    const { host, respondWith } = makeHost();
    respondWith(async () => fail("A página final deve ser maior que a inicial.", "validation"));
    const result = await createDataActions(host).addReadingSession({
      bookId: "b", occurredOn: "2026-10-07", startPage: 50, endPage: 40,
    });
    expect(result).toMatchObject({ ok: false, code: "validation", error: "A página final deve ser maior que a inicial." });
  });
});

describe("corrida", () => {
  it("usa o id do formulário e o relógio do host (nowMs) no comando", async () => {
    const { host, dispatched } = makeHost();
    const result = await createDataActions(host).addRunningSession({ id: "form-1", occurredOn: "2026-10-07", distanceMeters: 5200 });
    expect(result).toEqual(ok({ id: "form-1" }));
    expect(dispatched[0]).toEqual({ type: "running.addSession", nowMs: NOW, session: { id: "form-1", occurredOn: "2026-10-07", distanceMeters: 5200 } });
  });

  it("sem id informado, gera um (e o devolve)", async () => {
    const { host, dispatched } = makeHost();
    const result = await createDataActions(host).addRunningSession({ occurredOn: "2026-10-07" });
    expect(result).toEqual(ok({ id: "id-1" }));
    expect(dispatched[0]).toMatchObject({ session: { id: "id-1", occurredOn: "2026-10-07" } });
  });

  it("nova tentativa depois de uma falha (ou de uma resposta perdida) reenvia o MESMO id: nunca duplica", async () => {
    const { host, dispatched, respondWith } = makeHost();
    const actions = createDataActions(host);
    const input = { id: "form-1", occurredOn: "2026-10-07", distanceMeters: 5000 };

    respondWith(async () => fail("Sem conexão com o servidor. Nada foi salvo.", "offline"));
    expect(await actions.addRunningSession(input)).toMatchObject({ ok: false, code: "offline" });
    respondWith(async () => ok<Outcome>("saved"));
    expect(await actions.addRunningSession(input)).toEqual(ok({ id: "form-1" }));

    const ids = dispatched.map((c) => (c.type === "running.addSession" ? c.session.id : null));
    expect(ids).toEqual(["form-1", "form-1"]);
  });

  it("propaga a recusa de data futura sem inventar sucesso", async () => {
    const { host, respondWith } = makeHost();
    respondWith(async () => fail("Não é possível registrar uma corrida em uma data futura.", "validation"));
    const result = await createDataActions(host).addRunningSession({ id: "f", occurredOn: "2026-10-09" });
    expect(result).toMatchObject({ ok: false, code: "validation", error: "Não é possível registrar uma corrida em uma data futura." });
  });

  it("editar e excluir mandam o id da corrida; editar leva o relógio", async () => {
    const { host, dispatched } = makeHost();
    const actions = createDataActions(host);
    expect(await actions.updateRunningSession("r1", { occurredOn: "2026-10-06" })).toEqual(ok());
    expect(await actions.deleteRunningSession("r1")).toEqual(ok());
    expect(dispatched).toEqual([
      { type: "running.updateSession", id: "r1", fields: { occurredOn: "2026-10-06" }, nowMs: NOW },
      { type: "running.deleteSession", id: "r1" },
    ]);
  });
});

describe("água", () => {
  it("cada toque é um registro NOVO, com id próprio, e leva o relógio do host (instante e nowMs)", async () => {
    const { host, dispatched } = makeHost();
    const actions = createDataActions(host);
    const first = await actions.addWater({ ml: 500 });
    const second = await actions.addWater({ ml: 500 });
    expect(first).toEqual(ok({ id: "id-1" }));
    expect(second).toEqual(ok({ id: "id-2" })); // o mesmo valor duas vezes são DOIS toques: nunca viram um só
    expect(dispatched).toEqual([
      { type: "water.add", nowMs: NOW, intake: { id: "id-1", at: NOW, ml: 500 } },
      { type: "water.add", nowMs: NOW, intake: { id: "id-2", at: NOW, ml: 500 } },
    ]);
  });

  it("toques ao mesmo tempo NÃO são travados (não há `once`): todos chegam ao host", async () => {
    const gate = deferred<Result<Outcome>>();
    const { host, dispatched, respondWith } = makeHost();
    respondWith(() => gate.promise);
    const actions = createDataActions(host);
    const taps = [actions.addWater({ ml: 100 }), actions.addWater({ ml: 100 }), actions.addWater({ ml: 100 })];
    await Promise.resolve();
    expect(dispatched).toHaveLength(3);
    gate.resolve(ok<Outcome>("saved"));
    expect((await Promise.all(taps)).map((r) => r.ok)).toEqual([true, true, true]);
  });

  it("registro avulso: usa o instante informado; o relógio do host vai em nowMs", async () => {
    const { host, dispatched } = makeHost();
    await createDataActions(host).addWater({ ml: 250, at: NOW - 3_600_000 });
    expect(dispatched[0]).toEqual({ type: "water.add", nowMs: NOW, intake: { id: "id-1", at: NOW - 3_600_000, ml: 250 } });
  });

  it("reenviar o MESMO toque (id informado) depois de uma falha mantém o id: o servidor não duplica", async () => {
    const { host, dispatched, respondWith } = makeHost();
    const actions = createDataActions(host);
    respondWith(async () => fail("Sem conexão com o servidor. Nada foi salvo.", "offline"));
    expect(await actions.addWater({ id: "tap-1", ml: 500 })).toMatchObject({ ok: false, code: "offline" });
    respondWith(async () => ok<Outcome>("saved"));
    expect(await actions.addWater({ id: "tap-1", ml: 500 })).toEqual(ok({ id: "tap-1" }));
    expect(dispatched.map((c) => (c.type === "water.add" ? c.intake.id : null))).toEqual(["tap-1", "tap-1"]);
  });

  it("propaga a recusa sem inventar sucesso", async () => {
    const { host, respondWith } = makeHost();
    respondWith(async () => fail("Horário no futuro.", "validation"));
    expect(await createDataActions(host).addWater({ ml: 500, at: NOW + 3_600_000 })).toMatchObject({ ok: false, code: "validation", error: "Horário no futuro." });
  });

  it("remover manda só o id", async () => {
    const { host, dispatched } = makeHost();
    expect(await createDataActions(host).removeWater("w1")).toEqual(ok());
    expect(dispatched).toEqual([{ type: "water.remove", id: "w1" }]);
  });
});

describe("encerrar o treino", () => {
  it("sem rascunho: 'none', sem chamar o servidor", async () => {
    const { host, dispatched } = makeHost();
    expect(await createDataActions(host).finishWorkout()).toEqual(ok("none"));
    expect(dispatched).toHaveLength(0);
  });

  it("sem nenhuma série concluída: 'empty', nada é enviado e o rascunho fica", async () => {
    const { host, dispatched, state } = makeHost({ draft: draftWith(false) });
    expect(await createDataActions(host).finishWorkout()).toEqual(ok("empty"));
    expect(dispatched).toHaveLength(0);
    expect(state.draft).not.toBeNull();
  });

  it("usa o id do rascunho como id da sessão e só então apaga o rascunho", async () => {
    const { host, dispatched, state } = makeHost({ draft: draftWith(true) });
    expect(await createDataActions(host).finishWorkout()).toEqual(ok("saved"));
    expect(dispatched[0]).toMatchObject({ type: "workout.finish", session: { id: "draft-1", occurredOn: "2026-10-07" } });
    expect(host.clearDraft).toHaveBeenCalledTimes(1);
    expect(state.draft).toBeNull();
  });

  it("se o servidor falhar, o treino NÃO é perdido e a nova tentativa reenvia a mesma sessão", async () => {
    const { host, dispatched, state, respondWith } = makeHost({ draft: draftWith(true) });
    const actions = createDataActions(host);

    respondWith(async () => fail("Sem conexão.", "offline"));
    expect(await actions.finishWorkout()).toMatchObject({ ok: false, code: "offline" });
    expect(host.clearDraft).not.toHaveBeenCalled();
    expect(state.draft).not.toBeNull();

    respondWith(async () => ok<Outcome>("saved"));
    expect(await actions.finishWorkout()).toEqual(ok("saved"));
    const ids = dispatched.map((c) => (c.type === "workout.finish" ? c.session.id : null));
    expect(ids).toEqual(["draft-1", "draft-1"]);
  });

  it("segundo toque enquanto o primeiro espera a rede não cria outra sessão", async () => {
    const { host, dispatched, respondWith } = makeHost({ draft: draftWith(true) });
    const gate = deferred<Result<Outcome>>();
    respondWith(() => gate.promise);
    const actions = createDataActions(host);

    const first = actions.finishWorkout();
    const second = actions.finishWorkout();
    expect(await second).toEqual(ok("none"));
    gate.resolve(ok<Outcome>("saved"));
    expect(await first).toEqual(ok("saved"));
    expect(dispatched).toHaveLength(1);
  });
});

describe("cronômetro de estudo", () => {
  const running = { timer: { subjectId: "s", startedAt: NOW - 1_800_000, runningSince: NOW - 1_800_000, accumulatedSeconds: 0 } };

  it("iniciar, pausar e retomar enviam o relógio do aparelho", async () => {
    const { host, dispatched } = makeHost();
    const actions = createDataActions(host);
    await actions.startStudy("s");
    await actions.pauseStudy();
    await actions.resumeStudy();
    expect(dispatched).toEqual([
      { type: "study.start", subjectId: "s", nowMs: NOW },
      { type: "study.pause", nowMs: NOW },
      { type: "study.resume", nowMs: NOW },
    ]);
  });

  it("finalizar sem cronômetro: 'none', sem chamar o servidor", async () => {
    const { host, dispatched } = makeHost();
    expect(await createDataActions(host).finishStudy()).toEqual(ok("none"));
    expect(dispatched).toHaveLength(0);
  });

  it("repassa o desfecho do servidor (too_short)", async () => {
    const { host, respondWith } = makeHost({ data: running });
    respondWith(async () => ok<Outcome>("too_short"));
    expect(await createDataActions(host).finishStudy()).toEqual(ok("too_short"));
  });

  it("toque duplo em Finalizar enquanto espera a rede grava uma única duração", async () => {
    const { host, dispatched, respondWith } = makeHost({ data: running });
    const gate = deferred<Result<Outcome>>();
    respondWith(() => gate.promise);
    const actions = createDataActions(host);

    const first = actions.finishStudy();
    const second = await actions.finishStudy();
    expect(second).toEqual(ok("none"));
    gate.resolve(ok<Outcome>("saved"));
    expect(await first).toEqual(ok("saved"));
    expect(dispatched.filter((c) => c.type === "study.finish")).toHaveLength(1);
  });

  it("depois de concluir, a trava libera para a próxima sessão", async () => {
    const { host, dispatched } = makeHost({ data: running });
    const actions = createDataActions(host);
    await actions.finishStudy();
    await actions.finishStudy();
    expect(dispatched.filter((c) => c.type === "study.finish")).toHaveLength(2);
  });
});
