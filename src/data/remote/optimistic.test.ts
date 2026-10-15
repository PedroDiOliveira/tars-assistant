import { describe, expect, it } from "vitest";
import type { Command } from "@/domain/commands";
import { EMPTY_APP_DATA, type AppData } from "@/domain/snapshot";
import { discardEntry, replay, startBurst, type BurstEntry } from "./optimistic";

const NOW = Date.UTC(2026, 9, 7, 17, 0);
const tap = (id: string, ml = 100): Command => ({ type: "water.add", intake: { id, at: NOW, ml }, nowMs: NOW });
const base: AppData = { ...EMPTY_APP_DATA };
const ids = (data: AppData) => data.waterIntakes.map((w) => w.id);

describe("replay", () => {
  it("aplica os comandos em ordem sobre a base, sem alterá-la", () => {
    const data = replay(base, [tap("a"), tap("b"), tap("c")]);
    expect(ids(data)).toEqual(["a", "b", "c"]);
    expect(base.waterIntakes).toEqual([]);
  });

  it("sem comandos devolve a própria base (mesma referência)", () => {
    expect(replay(base, [])).toBe(base);
  });

  it("ignora um comando que o domínio recusa agora, sem perder os demais", () => {
    const data = replay(base, [tap("a"), tap("bad", 0), tap("c")]);
    expect(ids(data)).toEqual(["a", "c"]);
  });

  it("a ordem importa: adicionar e depois remover deixa vazio; remover e depois adicionar deixa o registro", () => {
    const remove: Command = { type: "water.remove", id: "a" };
    expect(ids(replay(base, [tap("a"), remove]))).toEqual([]);
    expect(ids(replay(base, [remove, tap("a")]))).toEqual(["a"]);
  });
});

describe("rajada", () => {
  const enter = (burst: ReturnType<typeof startBurst>, command: Command): BurstEntry => {
    const entry = { command };
    burst.entries.push(entry);
    return entry;
  };

  it("descartar uma entrada refaz a tela sem ela e mantém as outras, na mesma ordem", () => {
    const burst = startBurst(base);
    enter(burst, tap("a"));
    const failing = enter(burst, tap("b"));
    enter(burst, tap("c"));
    expect(ids(discardEntry(burst, failing))).toEqual(["a", "c"]);
    expect(burst.entries).toHaveLength(2);
  });

  it("descartar TODAS devolve exatamente a base que o servidor conhecia", () => {
    const known: AppData = { ...EMPTY_APP_DATA, waterIntakes: [{ id: "server", at: NOW - 1000, ml: 250 }] };
    const burst = startBurst(known);
    const entries = [enter(burst, tap("a")), enter(burst, tap("b")), enter(burst, tap("c"))];
    let data = known;
    for (const entry of entries) data = discardEntry(burst, entry);
    expect(data).toBe(known);
  });

  it("dois toques idênticos são duas entradas: descartar um não leva o outro junto", () => {
    const burst = startBurst(base);
    const first = enter(burst, tap("a"));
    enter(burst, tap("a"));
    // o mesmo id aplicado duas vezes é um registro só, e descartar um dos envios não apaga o que o outro garante
    expect(ids(discardEntry(burst, first))).toEqual(["a"]);
  });

  it("um comando que dependia do descartado some junto (o desfazer de um toque que não saiu)", () => {
    const burst = startBurst(base);
    const adding = enter(burst, tap("a"));
    enter(burst, { type: "water.remove", id: "a" });
    expect(ids(discardEntry(burst, adding))).toEqual([]); // remover o que não existe: vazio, sem erro
  });
});
