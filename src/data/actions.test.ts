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
