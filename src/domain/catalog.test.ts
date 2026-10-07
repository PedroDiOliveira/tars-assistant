import { describe, expect, it } from "vitest";
import { activeOnly, isActive } from "./catalog";

const items = [{ id: "a" }, { id: "b", archived: true }, { id: "c", archived: true }, { id: "d", archived: false }];

describe("catálogo", () => {
  it("isActive", () => {
    expect(items.map(isActive)).toEqual([true, false, false, true]);
  });
  it("activeOnly esconde os arquivados", () => {
    expect(activeOnly(items).map((i) => i.id)).toEqual(["a", "d"]);
  });
  it("activeOnly mantém o arquivado que já estava escolhido (editar um lançamento antigo)", () => {
    expect(activeOnly(items, ["b"]).map((i) => i.id)).toEqual(["a", "b", "d"]);
    expect(activeOnly(items, [undefined, null]).map((i) => i.id)).toEqual(["a", "d"]);
  });
  it("não muda a ordem nem a lista original", () => {
    const copy = structuredClone(items);
    activeOnly(items, ["c"]);
    expect(items).toEqual(copy);
  });
});
