import { beforeAll, describe, expect, it } from "vitest";
import { parseDisplayName } from "@/domain/profile";
import type { RpcClient } from "@/server/commands";
import { saveDisplayName } from "@/server/profile";
import { sqlMessage, sqlState, TestDb } from "./harness";
import { rpcClientFor } from "./rpc-client";

let t: TestDb;
let A: string;
let B: string;

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const nameOf = async (id: string) =>
  (await t.admin<{ display_name: string }>("select display_name from public.profiles where id = $1", [id]))[0].display_name;

/** Um cliente que conta quantas chamadas chegaram ao banco. */
function counting(client: RpcClient): RpcClient & { calls: number } {
  const wrapped = {
    calls: 0,
    rpc(fn: string, args?: Record<string, unknown>) {
      wrapped.calls += 1;
      return client.rpc(fn, args);
    },
  };
  return wrapped;
}

beforeAll(async () => {
  t = await TestDb.create();
  A = await t.createUser({ email: "ana@tars.example" });
  B = await t.createUser({ email: "bruno@tars.example" });
});

describe("salvar o nome pelo servidor (saveDisplayName → set_display_name)", () => {
  it("renomeia só o próprio perfil e devolve o nome como ficou gravado", async () => {
    const result = await saveDisplayName(rpcClientFor(t, A), "  Ana   Maria ");
    expect(result).toEqual({ ok: true, value: { displayName: "Ana Maria" } });
    expect(await nameOf(A)).toBe("Ana Maria");
    expect(await nameOf(B)).toBe("bruno");
  });

  it("o snapshot passa a trazer o novo nome", async () => {
    await saveDisplayName(rpcClientFor(t, A), "Ana M.");
    const snapshot = await t.as(A, (s) => s.snapshot());
    expect(snapshot.profile).toEqual({ displayName: "Ana M." });
  });

  it("é idempotente: repetir o mesmo nome não muda nada nem falha", async () => {
    const first = await saveDisplayName(rpcClientFor(t, A), "Ana Idempotente");
    const second = await saveDisplayName(rpcClientFor(t, A), "Ana Idempotente");
    expect(second).toEqual(first);
    expect(await nameOf(A)).toBe("Ana Idempotente");
  });

  it("sem sessão válida é 'unauthorized' e nada é gravado", async () => {
    const before = await nameOf(A);
    const result = await saveDisplayName(rpcClientFor(t, null), "Invasor");
    expect(result).toMatchObject({ ok: false, code: "unauthorized", error: "Sua sessão expirou. Entre de novo." });
    expect(await nameOf(A)).toBe(before);
  });

  it("entrada inválida é recusada no servidor sem sequer chamar o banco", async () => {
    const client = counting(rpcClientFor(t, A));
    for (const raw of [undefined, null, 42, {}, "", "   ", "Pe" + cp(0x200b) + "dro", cp(0x202e) + "Ana", "a".repeat(61)]) {
      const result = await saveDisplayName(client, raw);
      expect(result).toMatchObject({ ok: false, code: "validation" });
    }
    expect(client.calls).toBe(0);
  });

  it("um usuário sem perfil recebe uma mensagem clara, não um erro genérico", async () => {
    const orphan = await t.createUser({ email: "orfao@tars.example" });
    await t.admin("delete from public.profiles where id = $1", [orphan]);
    const result = await saveDisplayName(rpcClientFor(t, orphan), "Órfão");
    expect(result).toMatchObject({ ok: false, code: "validation", error: "Perfil não encontrado." });
  });

  it("resposta fora do contrato não é tratada como sucesso", async () => {
    const broken: RpcClient = { rpc: async () => ({ data: { displayName: "x" }, error: null }) };
    expect(await saveDisplayName(broken, "Ana")).toMatchObject({ ok: false, code: "unknown" });
  });
});

describe("o banco recusa nome inválido por QUALQUER caminho (RPC e UPDATE direto)", () => {
  const cases: Array<[string, string | null, string]> = [
    ["vazio", "", "Informe um nome."],
    ["nulo", null, "Informe um nome."],
    ["61 caracteres", "a".repeat(61), "O nome pode ter no máximo 60 caracteres."],
    ["tab", "Ana" + cp(9) + "Maria", "O nome tem caracteres inválidos."],
    ["quebra de linha", "Ana" + cp(10) + "Maria", "O nome tem caracteres inválidos."],
    ["controle C1", "Ana" + cp(0x85), "O nome tem caracteres inválidos."],
    ["largura zero", "An" + cp(0x200b) + "a", "O nome tem caracteres inválidos."],
    ["junção de largura zero", "An" + cp(0x200d) + "a", "O nome tem caracteres inválidos."],
    ["inversão de direção", cp(0x202e) + "anA", "O nome tem caracteres inválidos."],
    ["isolamento bidirecional", "Ana" + cp(0x2066), "O nome tem caracteres inválidos."],
    ["espaço não separável", "Ana" + cp(0xa0) + "Maria", "O nome tem caracteres inválidos."],
    ["espaço ideográfico", "Ana" + cp(0x3000) + "Maria", "O nome tem caracteres inválidos."],
    ["hífen suave", "An" + cp(0xad) + "a", "O nome tem caracteres inválidos."],
    ["BOM", cp(0xfeff) + "Ana", "O nome tem caracteres inválidos."],
    ["separador de linha", "Ana" + cp(0x2028) + "Maria", "O nome tem caracteres inválidos."],
    ["uso privado", "Ana" + cp(0xe000), "O nome tem caracteres inválidos."],
    ["caractere de tag", "Ana" + cp(0xe0041), "O nome tem caracteres inválidos."],
    ["espaço no começo", " Ana", "O nome tem espaços sobrando ou não está normalizado."],
    ["espaço no fim", "Ana ", "O nome tem espaços sobrando ou não está normalizado."],
    ["espaços repetidos", "Ana  Maria", "O nome tem espaços sobrando ou não está normalizado."],
    ["fora do NFC (a + til)", "Joa" + cp(0x303) + "o", "O nome tem espaços sobrando ou não está normalizado."],
  ];

  it.each(cases)("recusa %s", async (_label, value, message) => {
    const before = await nameOf(A);

    const viaRpc = t.as(A, (s) => s.query("select public.set_display_name($1)", [value]));
    expect(await sqlState(viaRpc)).toBe("23514");
    expect(await sqlMessage(t.as(A, (s) => s.query("select public.set_display_name($1)", [value])))).toBe(message);

    // O caminho que um PATCH direto no PostgREST faria, sem passar pelo app nem pela função.
    const direct = t.as(A, (s) => s.query("update public.profiles set display_name = $1", [value]));
    // O gatilho (BEFORE) roda antes do NOT NULL: até o NULL direto recebe a nossa mensagem, não a do Postgres.
    expect(await sqlState(direct)).toBe("23514");
    expect(await sqlMessage(t.as(A, (s) => s.query("update public.profiles set display_name = $1", [value])))).toBe(message);

    expect(await nameOf(A)).toBe(before);
  });
});

describe("o banco nunca recusa o que o app aceita (paridade com domain/profile.ts)", () => {
  const raws = [
    "Pedro",
    "João da Silva",
    "D'Ávila",
    "D" + cp(0x2019) + "Ávila",
    "Maria-Clara",
    "Pedro H. S.",
    "Zoë",
    "李雷",
    "Pedro 🚀",
    "R2D2",
    "a".repeat(60),
    "😀".repeat(59) + "a",
    "<b>Pedro</b>",
    "  Pedro   Henrique  ",
    "Pedro" + cp(0xa0) + "Henrique",
    cp(0x3000) + "Pedro" + cp(0x2003, 0x2003) + "Henrique" + cp(0x202f),
    "Joa" + cp(0x303) + "o",
    "Nguye" + cp(0x302, 0x303) + "n",
  ];

  it.each(raws)("salva %j exatamente como o app normalizou", async (raw) => {
    const parsed = parseDisplayName(raw);
    if (!parsed.ok) throw new Error(`fixture deveria ser válida: ${parsed.error}`);
    const result = await saveDisplayName(rpcClientFor(t, A), raw);
    expect(result).toEqual({ ok: true, value: { displayName: parsed.name } });
    expect(await nameOf(A)).toBe(parsed.name);
  });
});

describe("privilégios do perfil", () => {
  it("o cliente só atualiza display_name: as outras colunas são recusadas", async () => {
    expect(await t.as(A, (s) => sqlState(s.query("update public.profiles set created_at = now()")))).toBe("42501");
    expect(await t.as(A, (s) => sqlState(s.query("update public.profiles set updated_at = now()")))).toBe("42501");
    expect(await t.as(A, (s) => sqlState(s.query("update public.profiles set id = gen_random_uuid()")))).toBe("42501");
  });

  it("não altera o nome de outra pessoa (RLS esconde a linha: zero linhas afetadas)", async () => {
    const before = await nameOf(B);
    await t.as(A, (s) => s.query("update public.profiles set display_name = 'Invasor' where id = $1", [B]));
    expect(await nameOf(B)).toBe(before);
  });

  it("a função de renomear nunca age sobre outro usuário: o dono vem do JWT, não do argumento", async () => {
    const before = await nameOf(B);
    await t.as(A, (s) => s.query("select public.set_display_name($1)", ["Só da Ana"]));
    expect(await nameOf(B)).toBe(before);
    expect(await nameOf(A)).toBe("Só da Ana");
  });

  it("sem login (anon) não executa a função de renomear", async () => {
    expect(await t.anon((s) => sqlState(s.query("select public.set_display_name('X')")))).toBe("42501");
  });

  it("com o papel authenticated mas sem sub no JWT, a função recusa com mensagem clara", async () => {
    await t.pg.exec("set role authenticated");
    try {
      expect(await sqlMessage(t.pg.query("select public.set_display_name('X')"))).toBe("Não autenticado.");
    } finally {
      await t.pg.exec("reset role");
    }
  });

  it("não executa a função do gatilho diretamente", async () => {
    expect(await t.as(A, (s) => sqlState(s.query("select private.check_profile_name()")))).toBe("42501");
  });
});

describe("o cadastro não é barrado pela regra de nome", () => {
  it("e-mail sem parte local gera perfil com nome vazio, que depois pode ser definido pelo app", async () => {
    const [{ id }] = await t.admin<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values (null, '{}'::jsonb) returning id",
    );
    expect(await nameOf(id)).toBe("");
    expect(await saveDisplayName(rpcClientFor(t, id), "Novo Nome")).toMatchObject({ ok: true });
    expect(await nameOf(id)).toBe("Novo Nome");
  });

  it("um nome de cadastro cortado em 60 caracteres, mesmo terminando em espaço, entra e pode ser trocado", async () => {
    const meta = { display_name: "a".repeat(59) + " " + "b".repeat(10) };
    const [{ id }] = await t.admin<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ('longo@tars.example', $1::jsonb) returning id",
      [JSON.stringify(meta)],
    );
    expect((await nameOf(id)).length).toBe(60);
    expect(await saveDisplayName(rpcClientFor(t, id), "Curto")).toMatchObject({ ok: true });
  });
});
