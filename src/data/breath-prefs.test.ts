import { afterEach, describe, expect, it, vi } from "vitest";

/** localStorage de mentira (o ambiente de teste é Node). */
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
  const mod = await import("./breath-prefs");
  return { ...mod, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sanitizeBreathPrefs", () => {
  it("valores válidos passam intactos", async () => {
    const { sanitizeBreathPrefs } = await load();
    expect(sanitizeBreathPrefs({ pattern: "box", sound: true })).toEqual({ pattern: "box", sound: true });
  });

  it("lixo volta ao padrão coerente, sem som, campo a campo", async () => {
    const { sanitizeBreathPrefs } = await load();
    for (const raw of [null, undefined, 42, "x", [], {}]) {
      expect(sanitizeBreathPrefs(raw), JSON.stringify(raw)).toEqual({ pattern: "coherent", sound: false });
    }
    expect(sanitizeBreathPrefs({ pattern: "hiperventilar", sound: true })).toEqual({ pattern: "coherent", sound: true });
    expect(sanitizeBreathPrefs({ pattern: "478", sound: "sim" })).toEqual({ pattern: "478", sound: false });
  });
});

describe("store de preferências", () => {
  it("nasce no padrão coerente, com o som desligado", async () => {
    const { useBreathPrefs } = await load();
    expect(useBreathPrefs.getState()).toMatchObject({ pattern: "coherent", sound: false });
  });

  it("guarda só os dados, nunca as funções", async () => {
    const { useBreathPrefs, BREATH_PREFS_KEY, storage } = await load();
    useBreathPrefs.getState().setPattern("extended");
    useBreathPrefs.getState().setSound(true);
    const saved = JSON.parse(storage.map.get(BREATH_PREFS_KEY)!);
    expect(saved.state).toEqual({ pattern: "extended", sound: true });
    expect(JSON.stringify(saved)).not.toMatch(/setPattern|setSound|function/);
  });

  it("reidratar lê o que foi guardado; valor adulterado não entra", async () => {
    const good = JSON.stringify({ state: { pattern: "box", sound: true }, version: 1 });
    const first = await load({ "tars-breath-prefs-v1": good });
    await first.hydrateBreathPrefs();
    expect(first.useBreathPrefs.getState()).toMatchObject({ pattern: "box", sound: true });

    const bad = JSON.stringify({ state: { pattern: "<script>", sound: 1 }, version: 1 });
    const second = await load({ "tars-breath-prefs-v1": bad });
    await second.hydrateBreathPrefs();
    expect(second.useBreathPrefs.getState()).toMatchObject({ pattern: "coherent", sound: false });
  });

  it("JSON quebrado no armazenamento não derruba o app", async () => {
    const { useBreathPrefs, hydrateBreathPrefs } = await load({ "tars-breath-prefs-v1": "{não é json" });
    await expect(hydrateBreathPrefs()).resolves.toBeUndefined();
    expect(useBreathPrefs.getState().pattern).toBe("coherent");
  });

  it("sair da conta apaga as preferências da memória E do armazenamento", async () => {
    const { useBreathPrefs, wipeBreathPrefs, BREATH_PREFS_KEY, storage } = await load();
    useBreathPrefs.getState().setPattern("478");
    expect(storage.map.has(BREATH_PREFS_KEY)).toBe(true);
    wipeBreathPrefs();
    expect(storage.map.has(BREATH_PREFS_KEY)).toBe(false);
    expect(useBreathPrefs.getState()).toMatchObject({ pattern: "coherent", sound: false });
  });
});
