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
