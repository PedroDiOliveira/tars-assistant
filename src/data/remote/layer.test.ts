import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "@/domain/commands";
import { EMPTY_APP_DATA } from "@/domain/snapshot";
import { fail, ok, type Result } from "../contract";
import type { SnapshotPayload } from "./payload";

// As Server Actions rodam no servidor; aqui o "servidor" é um dublê controlado pelo teste.
vi.mock("@/server/actions/commands", () => ({ runCommand: vi.fn() }));
vi.mock("@/server/actions/auth", () => ({ signOut: vi.fn() }));
// A Server Action de nome passa por uma função comum: assim o cenário "servidor fora do ar" rejeita uma função de
// verdade (um `vi.fn` que rejeita faz o Vitest 5 atribuir a rejeição ao teste, mesmo tratada pelo código).
const profileServer = vi.hoisted(() => ({ impl: (async () => undefined) as (name: string) => Promise<unknown> }));
vi.mock("@/server/actions/profile", () => ({ updateDisplayName: (name: string) => profileServer.impl(name) }));

const { runCommand } = await import("@/server/actions/commands");
const { remoteLayer } = await import("./layer");
const { queryClient, SNAPSHOT_KEY } = await import("./query");

const server = vi.mocked(runCommand);
const actions = remoteLayer.actions;

const payload = (): SnapshotPayload => ({
  data: { ...EMPTY_APP_DATA },
  profile: { displayName: "Pedro" },
  user: { email: null },
  serverNow: 0,
  capabilities: { ai: false, aiProvider: null },
});
const cached = () => queryClient.getQueryData<SnapshotPayload>(SNAPSHOT_KEY)!;
const runs = () => cached().data.runningSessions;
const water = () => cached().data.waterIntakes;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  server.mockReset();
  queryClient.clear();
  queryClient.setQueryData(SNAPSHOT_KEY, payload());
});

describe("camada remota: escrita otimista confirmada pelo servidor", () => {
  it("sucesso: a corrida aparece e o aviso de sucesso só vem depois que o servidor confirmou", async () => {
    const pending = deferred<Result<Outcome>>();
    server.mockReturnValue(pending.promise);

    const saving = actions.addRunningSession({ id: "run-1", occurredOn: today(), distanceMeters: 5200 });
    await vi.waitFor(() => expect(runs()).toHaveLength(1)); // otimista: já está na tela
    let settled = false;
    void saving.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false); // ainda não confirmou: ninguém pode mostrar "salvo"

    pending.resolve(ok<Outcome>("saved"));
    expect(await saving).toEqual(ok({ id: "run-1" }));
    expect(runs()).toEqual([{ id: "run-1", occurredOn: today(), distanceMeters: 5200 }]);
  });

  it("falha do servidor: a corrida otimista SAI do total, mesmo que a releitura também falhe", async () => {
    server.mockResolvedValue(fail("Não foi possível salvar. Tente de novo.", "unknown"));
    const before = cached();

    const result = await actions.addRunningSession({ id: "run-1", occurredOn: today(), distanceMeters: 5200 });
    expect(result).toMatchObject({ ok: false });
    expect(runs()).toEqual([]);
    expect(cached()).toEqual(before);
  });

  it("servidor fora do ar (a chamada lança): mensagem de offline e nenhum total otimista permanente", async () => {
    server.mockRejectedValue(new Error("fetch failed"));
    const result = await actions.addRunningSession({ id: "run-1", occurredOn: today(), distanceMeters: 5200 });
    expect(result).toEqual({ ok: false, code: "offline", error: "Sem conexão com o servidor. Nada foi salvo." });
    expect(runs()).toEqual([]);
  });

  it("recusado pelo domínio (data futura) nem chega ao servidor", async () => {
    const result = await actions.addRunningSession({ id: "run-1", occurredOn: "2099-01-01" });
    expect(result).toMatchObject({ ok: false, code: "validation", error: "Não é possível registrar uma corrida em uma data futura." });
    expect(server).not.toHaveBeenCalled();
    expect(runs()).toEqual([]);
  });

  it("nova tentativa com o MESMO id depois de uma falha: uma corrida só, e o servidor recebe o mesmo id", async () => {
    server.mockResolvedValueOnce(fail("Sem conexão com o servidor. Nada foi salvo.", "offline"));
    server.mockResolvedValueOnce(ok<Outcome>("saved"));
    const input = { id: "run-1", occurredOn: today(), distanceMeters: 5000 };

    expect(await actions.addRunningSession(input)).toMatchObject({ ok: false });
    expect(runs()).toEqual([]);
    expect(await actions.addRunningSession(input)).toEqual(ok({ id: "run-1" }));
    expect(runs()).toHaveLength(1);

    const sent = server.mock.calls.map(([command]) => (command as { session: { id: string } }).session.id);
    expect(sent).toEqual(["run-1", "run-1"]);
  });

  it("toque duplo (duas chamadas com o mesmo id ao mesmo tempo): uma corrida na tela", async () => {
    server.mockResolvedValue(ok<Outcome>("saved"));
    const input = { id: "run-1", occurredOn: today() };
    await Promise.all([actions.addRunningSession(input), actions.addRunningSession(input)]);
    expect(runs()).toHaveLength(1);
  });

  it("falha de um comando não desfaz a atualização otimista de outro que ainda está a caminho", async () => {
    const slow = deferred<Result<Outcome>>();
    server.mockReturnValueOnce(slow.promise); // r1: demora
    server.mockResolvedValueOnce(fail("Não foi possível salvar. Tente de novo.", "unknown")); // r2: falha logo

    const first = actions.addRunningSession({ id: "r1", occurredOn: today() });
    await vi.waitFor(() => expect(runs().map((r) => r.id)).toContain("r1"));
    expect(await actions.addRunningSession({ id: "r2", occurredOn: today() })).toMatchObject({ ok: false });
    expect(runs().map((r) => r.id)).toContain("r1"); // continua na tela enquanto o servidor responde

    slow.resolve(ok<Outcome>("saved"));
    expect(await first).toEqual(ok({ id: "r1" }));
  });

  it("editar e excluir também voltam ao que era se o servidor recusar", async () => {
    server.mockResolvedValueOnce(ok<Outcome>("saved"));
    await actions.addRunningSession({ id: "run-1", occurredOn: today(), distanceMeters: 5000 });
    const saved = cached();

    server.mockResolvedValueOnce(fail("Sem conexão com o servidor. Nada foi salvo.", "offline"));
    expect(await actions.updateRunningSession("run-1", { occurredOn: today(), distanceMeters: 9999 })).toMatchObject({ ok: false });
    expect(cached()).toEqual(saved);

    server.mockResolvedValueOnce(fail("Sem conexão com o servidor. Nada foi salvo.", "offline"));
    expect(await actions.deleteRunningSession("run-1")).toMatchObject({ ok: false });
    expect(runs()).toEqual([{ id: "run-1", occurredOn: today(), distanceMeters: 5000 }]);
  });
});

describe("camada remota: toques de água em rajada", () => {
  const offline = () => fail("Sem conexão com o servidor. Nada foi salvo.", "offline");

  it("o toque aparece na hora (otimista) e o total só deixa de ser provisório quando o servidor confirma", async () => {
    const pending = deferred<Result<Outcome>>();
    server.mockReturnValue(pending.promise);

    const tap = actions.addWater({ id: "w1", ml: 500 });
    await vi.waitFor(() => expect(water()).toHaveLength(1));
    expect(water()[0]).toMatchObject({ id: "w1", ml: 500 });

    pending.resolve(ok<Outcome>("saved"));
    expect(await tap).toEqual(ok({ id: "w1" }));
    expect(water()).toHaveLength(1);
  });

  it("cinco toques seguidos SEM rede: nenhum fica na tela (o total volta ao que o servidor tem)", async () => {
    // Toques de verdade são espaçados: cada um enxerga na tela o efeito otimista dos anteriores, e o servidor
    // (que atende um de cada vez) só responde depois de todos. Nenhuma resposta chega antes do último toque.
    const gates = [1, 2, 3, 4, 5].map(() => deferred<Result<Outcome>>());
    let call = 0;
    server.mockImplementation(() => gates[call++].promise);
    const before = cached();

    const taps: Promise<Result<{ id: string }>>[] = [];
    for (let n = 1; n <= 5; n += 1) {
      taps.push(actions.addWater({ id: `w${n}`, ml: 100 }));
      await vi.waitFor(() => expect(water()).toHaveLength(n)); // o toque aparece na hora
    }
    for (const gate of gates) gate.resolve(offline());
    const results = await Promise.all(taps);

    expect(results.every((r) => !r.ok)).toBe(true);
    expect(water()).toEqual([]);
    expect(cached()).toEqual(before);
  });

  it("servidor fora do ar (a chamada lança) no meio da rajada: o que não foi salvo sai, o que foi salvo fica", async () => {
    server.mockResolvedValueOnce(ok<Outcome>("saved")); // w1 salvou
    server.mockRejectedValueOnce(new Error("fetch failed")); // w2 caiu
    server.mockResolvedValueOnce(ok<Outcome>("saved")); // w3 salvou

    const results = await Promise.all([
      actions.addWater({ id: "w1", ml: 100 }),
      actions.addWater({ id: "w2", ml: 200 }),
      actions.addWater({ id: "w3", ml: 300 }),
    ]);

    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(water().map((w) => w.id).sort()).toEqual(["w1", "w3"]);
    expect(water().reduce((sum, w) => sum + w.ml, 0)).toBe(400);
  });

  it("a falha é do toque que falhou: o primeiro cai e os seguintes continuam valendo", async () => {
    server.mockResolvedValueOnce(offline());
    server.mockResolvedValueOnce(ok<Outcome>("saved"));
    server.mockResolvedValueOnce(ok<Outcome>("saved"));

    await Promise.all([
      actions.addWater({ id: "w1", ml: 100 }),
      actions.addWater({ id: "w2", ml: 200 }),
      actions.addWater({ id: "w3", ml: 300 }),
    ]);
    expect(water().map((w) => w.id).sort()).toEqual(["w2", "w3"]);
  });

  it("desfazer enquanto o toque ainda está a caminho: some da tela e o servidor recebe adicionar e depois remover", async () => {
    const slow = deferred<Result<Outcome>>();
    server.mockReturnValueOnce(slow.promise); // add: demora
    server.mockResolvedValueOnce(ok<Outcome>("saved")); // remove

    const tap = actions.addWater({ id: "w1", ml: 500 });
    await vi.waitFor(() => expect(water()).toHaveLength(1));
    const undo = actions.removeWater("w1");
    await vi.waitFor(() => expect(water()).toHaveLength(0));

    slow.resolve(ok<Outcome>("saved"));
    expect(await Promise.all([tap, undo])).toEqual([ok({ id: "w1" }), ok()]);
    expect(water()).toEqual([]);
    expect(server.mock.calls.map(([command]) => (command as { type: string }).type)).toEqual(["water.add", "water.remove"]);
  });

  it("desfazer que FALHA devolve o registro à tela (continua salvo no servidor)", async () => {
    server.mockResolvedValueOnce(ok<Outcome>("saved"));
    await actions.addWater({ id: "w1", ml: 500 });
    const saved = cached();

    server.mockResolvedValueOnce(offline());
    expect(await actions.removeWater("w1")).toMatchObject({ ok: false });
    expect(cached()).toEqual(saved);
    expect(water()).toHaveLength(1);
  });

  it("nova tentativa do MESMO toque depois de uma resposta perdida: um registro só, com o mesmo id no servidor", async () => {
    server.mockResolvedValueOnce(offline());
    server.mockResolvedValueOnce(ok<Outcome>("saved"));
    const input = { id: "w1", ml: 500 };

    expect(await actions.addWater(input)).toMatchObject({ ok: false });
    expect(water()).toEqual([]);
    expect(await actions.addWater(input)).toEqual(ok({ id: "w1" }));
    expect(water()).toHaveLength(1);
    expect(server.mock.calls.map(([command]) => (command as { intake: { id: string } }).intake.id)).toEqual(["w1", "w1"]);
  });

  it("recusado pelo domínio (quantidade inválida, horário futuro) nem chega ao servidor", async () => {
    expect(await actions.addWater({ id: "w1", ml: 0 })).toMatchObject({ ok: false, code: "validation", error: "Quantidade de água inválida." });
    expect(await actions.addWater({ id: "w2", ml: 100, at: Date.now() + 3_600_000 })).toMatchObject({ ok: false, code: "validation", error: "Horário no futuro." });
    expect(server).not.toHaveBeenCalled();
    expect(water()).toEqual([]);
  });

  it("uma falha de água não desfaz uma corrida que ainda está a caminho (e vice-versa)", async () => {
    const slowRun = deferred<Result<Outcome>>();
    server.mockReturnValueOnce(slowRun.promise);
    server.mockResolvedValueOnce(offline());

    const run = actions.addRunningSession({ id: "r1", occurredOn: today() });
    await vi.waitFor(() => expect(runs().map((r) => r.id)).toContain("r1"));
    expect(await actions.addWater({ id: "w1", ml: 100 })).toMatchObject({ ok: false });
    expect(water()).toEqual([]);
    expect(runs().map((r) => r.id)).toContain("r1");

    slowRun.resolve(ok<Outcome>("saved"));
    await run;
  });

  it("o nome de exibição trocado durante a rajada não é desfeito por uma falha", async () => {
    server.mockRejectedValue(new Error("fetch failed"));
    queryClient.setQueryData<SnapshotPayload>(SNAPSHOT_KEY, (old) => (old ? { ...old, profile: { displayName: "Ana" } } : old));

    await Promise.all([actions.addWater({ id: "w1", ml: 100 }), actions.addWater({ id: "w2", ml: 100 })]);
    expect(cached().profile?.displayName).toBe("Ana");
    expect(water()).toEqual([]);
  });
});

describe("camada remota: nome de exibição", () => {
  const rename = vi.fn<(name: string) => Promise<Result<{ displayName: string }>>>();
  const shownName = () => cached().profile?.displayName;

  beforeEach(() => {
    rename.mockReset();
    profileServer.impl = rename;
  });

  it("manda ao servidor o nome já normalizado e guarda o que o SERVIDOR confirmou, não o digitado", async () => {
    rename.mockResolvedValue(ok({ displayName: "Pedro H. (confirmado)" }));

    const result = await remoteLayer.updateDisplayName("  Pedro   H. ");
    expect(rename).toHaveBeenCalledExactlyOnceWith("Pedro H.");
    expect(result).toEqual(ok({ displayName: "Pedro H. (confirmado)" }));
    expect(shownName()).toBe("Pedro H. (confirmado)");
  });

  it("não é otimista: o nome antigo continua na tela enquanto o servidor não responde", async () => {
    const pending = deferred<Result<{ displayName: string }>>();
    rename.mockReturnValue(pending.promise);

    const saving = remoteLayer.updateDisplayName("Novo");
    await Promise.resolve();
    expect(shownName()).toBe("Pedro");

    pending.resolve(ok({ displayName: "Novo" }));
    await saving;
    expect(shownName()).toBe("Novo");
  });

  it("nome inválido é recusado aqui, sem ida ao servidor, e o nome da tela não muda", async () => {
    const result = await remoteLayer.updateDisplayName("Pe\u200bdro");
    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(await remoteLayer.updateDisplayName("   ")).toMatchObject({ ok: false, code: "validation", error: "Informe um nome." });
    expect(rename).not.toHaveBeenCalled();
    expect(shownName()).toBe("Pedro");
  });

  it("o servidor recusou: devolve a mensagem e não muda o nome", async () => {
    rename.mockResolvedValue(fail("O nome tem caracteres inválidos.", "validation"));
    expect(await remoteLayer.updateDisplayName("Ana")).toEqual({ ok: false, code: "validation", error: "O nome tem caracteres inválidos." });
    expect(shownName()).toBe("Pedro");
  });

  it("servidor fora do ar (a chamada lança): mensagem de offline e o nome não muda", async () => {
    profileServer.impl = async () => {
      throw new Error("fetch failed");
    };
    expect(await remoteLayer.updateDisplayName("Ana")).toEqual({
      ok: false,
      code: "offline",
      error: "Sem conexão com o servidor. O nome não foi alterado.",
    });
    expect(shownName()).toBe("Pedro");
  });

  it("sessão expirada: repassa 'unauthorized' (a página volta ao login) e não muda o nome", async () => {
    rename.mockResolvedValue(fail("Sua sessão expirou. Entre de novo.", "unauthorized"));
    expect(await remoteLayer.updateDisplayName("Ana")).toMatchObject({ ok: false, code: "unauthorized" });
    expect(shownName()).toBe("Pedro");
  });

  it("não derruba um comando de dados que ainda está a caminho", async () => {
    const slow = deferred<Result<Outcome>>();
    server.mockReturnValueOnce(slow.promise);
    rename.mockResolvedValue(ok({ displayName: "Ana" }));

    const run = actions.addRunningSession({ id: "r1", occurredOn: today() });
    await vi.waitFor(() => expect(runs().map((r) => r.id)).toContain("r1"));
    await remoteLayer.updateDisplayName("Ana");
    expect(runs().map((r) => r.id)).toContain("r1"); // o nome novo não apagou o efeito otimista
    expect(shownName()).toBe("Ana");

    slow.resolve(ok<Outcome>("saved"));
    await run;
  });
});
