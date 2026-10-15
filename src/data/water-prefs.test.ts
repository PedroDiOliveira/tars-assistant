import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WATER_PORTIONS } from "@/domain/water";

/** localStorage de mentira (o ambiente de teste é Node): é o que permite provar o que fica guardado e o que é lido. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

async function load(initial: Record<string, string> = {}) {
  vi.resetModules();
  const storage = fakeStorage(initial);
  vi.stubGlobal("localStorage", storage);
  const mod = await import("./water-prefs");
  return { ...mod, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sanitizeWaterPrefs: só entra o que passa na regra do formulário", () => {
  let sanitize: (raw: unknown) => { portions: readonly number[]; selected: number };
  beforeEach(async () => {
    sanitize = (await load()).sanitizeWaterPrefs;
  });

  it("valores válidos passam intactos", () => {
    expect(sanitize({ portions: [200, 500, 1000], selected: 2 })).toEqual({ portions: [200, 500, 1000], selected: 2 });
  });

  it("lixo, nulo e vazio voltam aos valores de fábrica", () => {
    for (const raw of [null, undefined, 42, "x", [], {}, { portions: "abc" }]) {
      expect(sanitize(raw), JSON.stringify(raw)).toEqual({ portions: DEFAULT_WATER_PORTIONS, selected: 1 });
    }
  });

  it("porções inválidas (fora de ordem, zero, grandes demais, quantidade errada, texto) voltam às de fábrica, mantendo a escolha válida", () => {
    for (const portions of [[500, 100, 1000], [0, 500, 1000], [100, 500, 5001], [100, 500], [100, 500, 1000, 2000], ["100", 500, 1000], [100.5, 500, 1000]]) {
      expect(sanitize({ portions, selected: 0 }), JSON.stringify(portions)).toEqual({ portions: DEFAULT_WATER_PORTIONS, selected: 0 });
    }
  });

  it("escolha inválida volta à do meio, mantendo as porções válidas", () => {
    for (const selected of [-1, 3, 1.5, "1", null]) {
      expect(sanitize({ portions: [200, 500, 1000], selected }), String(selected)).toEqual({ portions: [200, 500, 1000], selected: 1 });
    }
  });
});

describe("store de preferências", () => {
  it("nasce com copo 100, garrafa 500 (selecionada) e garrafa grande 1 L", async () => {
    const { useWaterPrefs } = await load();
    expect(useWaterPrefs.getState()).toMatchObject({ portions: [100, 500, 1000], selected: 1 });
  });

  it("trocar a porção e editar as quantidades ficam guardadas só com os dados (nunca as funções)", async () => {
    const { useWaterPrefs, WATER_PREFS_KEY, storage } = await load();
    useWaterPrefs.getState().select(2);
    expect(useWaterPrefs.getState().setPortions([200, 600, 1500])).toBeNull();
    const saved = JSON.parse(storage.map.get(WATER_PREFS_KEY)!);
    expect(saved.state).toEqual({ portions: [200, 600, 1500], selected: 2 });
    expect(JSON.stringify(saved)).not.toMatch(/"select"|setPortions|function/);
  });

  it("quantidades inválidas são recusadas com a mensagem e NADA muda (nem o que está guardado)", async () => {
    const { useWaterPrefs } = await load();
    expect(useWaterPrefs.getState().setPortions([500, 100, 1000])).toMatch(/ordem crescente/);
    expect(useWaterPrefs.getState().setPortions([0, 500, 1000])).toMatch(/de 1 ml a 5 L/);
    expect(useWaterPrefs.getState().portions).toEqual([100, 500, 1000]);
  });

  it("reidratar lê o que foi guardado", async () => {
    const stored = JSON.stringify({ state: { portions: [250, 500, 1000], selected: 0 }, version: 1 });
    const { useWaterPrefs, hydrateWaterPrefs, WATER_PREFS_KEY } = await load({ "tars-water-prefs-v1": stored });
    expect(WATER_PREFS_KEY).toBe("tars-water-prefs-v1");
    await hydrateWaterPrefs();
    expect(useWaterPrefs.getState()).toMatchObject({ portions: [250, 500, 1000], selected: 0 });
  });

  it("um valor ADULTERADO no armazenamento não entra: volta às porções de fábrica", async () => {
    const stored = JSON.stringify({ state: { portions: [999999, 1, -5], selected: 9 }, version: 1 });
    const { useWaterPrefs, hydrateWaterPrefs } = await load({ "tars-water-prefs-v1": stored });
    await hydrateWaterPrefs();
    expect(useWaterPrefs.getState()).toMatchObject({ portions: [100, 500, 1000], selected: 1 });
  });

  it("JSON quebrado no armazenamento não derruba o app", async () => {
    const { useWaterPrefs, hydrateWaterPrefs } = await load({ "tars-water-prefs-v1": "{não é json" });
    await expect(hydrateWaterPrefs()).resolves.toBeUndefined();
    expect(useWaterPrefs.getState()).toMatchObject({ portions: [100, 500, 1000], selected: 1 });
  });

  it("armazenamento indisponível (janela anônima: acessar localStorage lança) não trava: segue só em memória", async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: o armazenamento está bloqueado");
      },
    });
    try {
      const { useWaterPrefs, hydrateWaterPrefs, wipeWaterPrefs } = await import("./water-prefs");
      await expect(hydrateWaterPrefs()).resolves.toBeUndefined();
      useWaterPrefs.getState().select(0);
      expect(useWaterPrefs.getState().selected).toBe(0);
      expect(() => wipeWaterPrefs()).not.toThrow();
      expect(useWaterPrefs.getState().selected).toBe(1);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it("sair da conta apaga as preferências da memória E do armazenamento", async () => {
    const { useWaterPrefs, wipeWaterPrefs, WATER_PREFS_KEY, storage } = await load();
    useWaterPrefs.getState().select(0);
    useWaterPrefs.getState().setPortions([200, 600, 1500]);
    expect(storage.map.has(WATER_PREFS_KEY)).toBe(true);
    wipeWaterPrefs();
    expect(storage.map.has(WATER_PREFS_KEY)).toBe(false);
    expect(useWaterPrefs.getState()).toMatchObject({ portions: [100, 500, 1000], selected: 1 });
  });
});
