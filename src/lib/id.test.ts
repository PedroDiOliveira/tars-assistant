import { describe, expect, it } from "vitest";
import { uid } from "./id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uid", () => {
  it("gera UUID v4 válido (é o que o banco exige)", () => {
    for (let i = 0; i < 200; i++) expect(uid()).toMatch(UUID_V4);
  });

  it("não repete em um lote grande", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uid()));
    expect(ids.size).toBe(10_000);
  });

  it("funciona sem crypto.randomUUID (contexto inseguro no Safari)", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(uid()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
