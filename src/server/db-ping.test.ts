import { describe, expect, it } from "vitest";
import type { RpcClient } from "./commands";
import { pingDatabase } from "./db-ping";

const client = (result: () => Promise<{ data: unknown; error: { code?: string } | null }>): RpcClient => ({ rpc: () => result() });

describe("pingDatabase", () => {
  it("ok quando o banco responde", async () => {
    expect((await pingDatabase(client(async () => ({ data: "2026-10-07T12:00:00Z", error: null })))).ok).toBe(true);
  });
  it("não ok quando o banco devolve erro (projeto pausado, rede)", async () => {
    expect((await pingDatabase(client(async () => ({ data: null, error: { code: "57P01" } })))).ok).toBe(false);
  });
  it("não ok, e sem lançar, quando a chamada explode", async () => {
    expect((await pingDatabase(client(async () => { throw new Error("fetch failed"); }))).ok).toBe(false);
  });
  it("não fica pendurado: estoura o prazo e responde não ok", async () => {
    const hang = client(() => new Promise(() => undefined));
    const started = Date.now();
    const result = await pingDatabase(hang, 80);
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
