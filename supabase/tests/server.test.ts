import { beforeAll, describe, expect, it } from "vitest";
import { uid } from "@/lib/id";
import { executeCommand, loadSnapshot, type RpcClient } from "@/server/commands";
import { TestDb } from "./harness";
import { rpcClientFor } from "./rpc-client";

let t: TestDb;
let user: string;
let client: RpcClient;
let foodId: string;

beforeAll(async () => {
  t = await TestDb.create();
  user = await t.createUser();
  client = rpcClientFor(t, user);
  const snap = await loadSnapshot(client);
  if (!snap.ok) throw new Error(snap.error);
  foodId = snap.value.data.categories.find((c) => c.name === "Alimentação")!.id;
});

const addTx = (over: Record<string, unknown> = {}) => ({
  type: "transaction.add",
  transaction: { id: uid(), type: "expense", amountCents: 4200, categoryId: foodId, description: "Outback", occurredOn: "2026-10-07", source: "manual", ...over },
});

describe("executeCommand", () => {
  it("salva e o snapshot reflete; repetir o mesmo comando responde 'saved' sem duplicar", async () => {
    const command = addTx({ id: uid() });
    expect(await executeCommand(client, command)).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(client, command)).toEqual({ ok: true, value: "saved" });
    const snap = await loadSnapshot(client);
    expect(snap.ok && snap.value.data.transactions.filter((x) => x.id === (command.transaction as { id: string }).id)).toHaveLength(1);
  });

  it("comando malformado é recusado ANTES de tocar o banco, com mensagem em português", async () => {
    const before = await t.admin<{ n: number }>("select count(*)::int as n from public.transactions");
    expect(await executeCommand(client, addTx({ amountCents: -5 }))).toMatchObject({ ok: false, code: "validation", error: "O valor deve ser maior que zero." });
    expect(await executeCommand(client, { type: "drop.table" })).toMatchObject({ ok: false, code: "validation", error: "Pedido inválido." });
    expect(await executeCommand(client, { ...addTx(), userId: uid() })).toMatchObject({ ok: false, code: "validation" });
    const after = await t.admin<{ n: number }>("select count(*)::int as n from public.transactions");
    expect(after[0].n).toBe(before[0].n);
  });

  it("regra de negócio do banco volta com a mensagem do domínio (ordem das páginas)", async () => {
    const book = { id: uid(), title: "Livro", totalPages: 320, initialPage: 0, status: "reading" };
    await executeCommand(client, { type: "book.add", book });
    const read = (startPage: number, endPage: number) => executeCommand(client, {
      type: "reading.addSession", session: { id: uid(), bookId: book.id, occurredOn: "2026-10-07", startPage, endPage },
    });
    expect(await read(50, 40)).toEqual({ ok: false, code: "validation", error: "A página final deve ser maior que a inicial." });
    expect(await read(300, 400)).toEqual({ ok: false, code: "validation", error: "O livro tem 320 páginas." });
    expect(await read(30, 50)).toEqual({ ok: true, value: "saved" });
  });

  it("livro inexistente: 'Livro não encontrado.'", async () => {
    expect(await executeCommand(client, {
      type: "reading.addSession", session: { id: uid(), bookId: uid(), occurredOn: "2026-10-07", startPage: 0, endPage: 10 },
    })).toEqual({ ok: false, code: "validation", error: "Livro não encontrado." });
  });

  it("referência a dado de outro usuário: erro de conflito, sem vazar o motivo", async () => {
    const other = await t.createUser();
    const snap = await loadSnapshot(rpcClientFor(t, other));
    const foreignCategory = snap.ok ? snap.value.data.categories[0].id : "";
    const result = await executeCommand(client, addTx({ categoryId: foreignCategory }));
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(JSON.stringify(result)).not.toMatch(/foreign key|constraint|categories/i);
  });

  it("matéria com nome repetido: mensagem específica (a do domínio), não o texto do índice", async () => {
    const subject = (id: string) => ({ type: "subject.add", subject: { id, name: "Segurança", hue: 150 } });
    expect(await executeCommand(client, subject(uid()))).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(client, subject(uid()))).toEqual({ ok: false, code: "validation", error: "Já existe uma matéria com este nome." });
  });

  it("sem sessão (sem sub no JWT): 'sessão expirou', nada é gravado", async () => {
    const result = await executeCommand(rpcClientFor(t, null), addTx());
    expect(result).toEqual({ ok: false, code: "unauthorized", error: "Sua sessão expirou. Entre de novo." });
  });

  it("falha de rede: o erro sem código vira 'offline' e afirma que nada foi salvo", async () => {
    const broken: RpcClient = { rpc: async () => ({ data: null, error: { message: "TypeError: fetch failed" } }) };
    expect(await executeCommand(broken, addTx())).toEqual({ ok: false, code: "offline", error: "Sem conexão com o servidor. Nada foi salvo." });
  });

  it("resposta fora do contrato nunca é tratada como sucesso", async () => {
    for (const data of [null, {}, { outcome: "banana" }, "saved", 42]) {
      const odd: RpcClient = { rpc: async () => ({ data, error: null }) };
      expect(await executeCommand(odd, addTx()), JSON.stringify(data)).toMatchObject({ ok: false, code: "unknown" });
    }
  });

  it("study.finish: o desfecho do banco chega ao cliente (too_short / none)", async () => {
    const subject = { id: uid(), name: "Redes", hue: 120 };
    await executeCommand(client, { type: "subject.add", subject });
    const now = Date.now();
    await t.setNow(now);
    await executeCommand(client, { type: "study.start", subjectId: subject.id, nowMs: now });
    await t.setNow(now + 20_000);
    expect(await executeCommand(client, { type: "study.finish", sessionId: uid(), nowMs: now })).toEqual({ ok: true, value: "too_short" });
    expect(await executeCommand(client, { type: "study.finish", sessionId: uid(), nowMs: now })).toEqual({ ok: true, value: "none" });
    await t.setNow(null);
  });
});

describe("loadSnapshot", () => {
  it("devolve o estado completo no formato do domínio, com o relógio do servidor", async () => {
    const snap = await loadSnapshot(client);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.value.data.categories).toHaveLength(10);
    expect(snap.value.profile?.displayName).toBeTruthy();
    expect(Math.abs(snap.value.serverNow - Date.now())).toBeLessThan(60_000);
  });

  it("erro do banco (ex.: projeto pausado) é traduzido, nunca devolve dado parcial", async () => {
    const down: RpcClient = { rpc: async () => ({ data: null, error: { code: "57P01", message: "terminating connection" } }) };
    expect(await loadSnapshot(down)).toMatchObject({ ok: false, code: "offline" });
  });

  it("formato inesperado do banco é erro explícito", async () => {
    const odd: RpcClient = { rpc: async () => ({ data: { categories: "não sou uma lista" }, error: null }) };
    expect(await loadSnapshot(odd)).toEqual({ ok: false, code: "unknown", error: "Não foi possível ler seus dados (formato inesperado)." });
  });
});
