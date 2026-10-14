import { beforeEach, describe, expect, it } from "vitest";
import { demoLayer } from "./layer";
import { useTarsStore } from "./store";

beforeEach(() => useTarsStore.setState({ displayName: "Pedro" }));

describe("demo: nome de exibição", () => {
  it("grava o nome normalizado no store e devolve como ficou", async () => {
    const result = await demoLayer.updateDisplayName("  Ana   Maria ");
    expect(result).toEqual({ ok: true, value: { displayName: "Ana Maria" } });
    expect(useTarsStore.getState().displayName).toBe("Ana Maria");
  });

  it("aplica a MESMA regra do modo real: nome inválido não muda nada", async () => {
    expect(await demoLayer.updateDisplayName("")).toMatchObject({ ok: false, code: "validation", error: "Informe um nome." });
    expect(await demoLayer.updateDisplayName("a".repeat(61))).toMatchObject({ ok: false, code: "validation" });
    expect(useTarsStore.getState().displayName).toBe("Pedro");
  });
});
