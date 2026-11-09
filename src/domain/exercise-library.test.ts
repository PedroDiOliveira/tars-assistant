import { describe, expect, it } from "vitest";
import {
  EXERCISE_LIBRARY,
  LIBRARY_KEY_PATTERN,
  MAX_LIBRARY_KEY,
  isLibraryKey,
  libraryEntry,
  matchLibrary,
  normalizeExerciseName,
  searchLibrary,
} from "./exercise-library";

describe("biblioteca de exercícios", () => {
  it("chaves únicas, no formato que o banco aceita", () => {
    const keys = EXERCISE_LIBRARY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(LIBRARY_KEY_PATTERN.test(key), key).toBe(true);
      expect(key.length, key).toBeLessThanOrEqual(MAX_LIBRARY_KEY);
    }
  });

  it("nomes cabem no cadastro (60) e grupos no campo de grupo (30); nenhum nome ou apelido se repete", () => {
    const seen = new Map<string, string>();
    for (const entry of EXERCISE_LIBRARY) {
      expect(entry.name.length, entry.key).toBeLessThanOrEqual(60);
      expect(entry.group.length, entry.key).toBeLessThanOrEqual(30);
      expect(entry.muscles.length, entry.key).toBeGreaterThan(0);
      for (const name of [entry.name, ...(entry.aliases ?? [])].map(normalizeExerciseName)) {
        // um apelido que apontasse para dois exercícios tornaria o reconhecimento ambíguo
        expect(seen.get(name) ?? entry.key, `${name}: ${seen.get(name)} e ${entry.key}`).toBe(entry.key);
        seen.set(name, entry.key);
      }
    }
  });

  it("peso corporal é exatamente o equipamento 'peso-corporal'", () => {
    for (const entry of EXERCISE_LIBRARY) {
      expect(entry.loadType === "bodyweight", entry.key).toBe(entry.equipment === "peso-corporal");
    }
  });

  it("busca por chave", () => {
    expect(libraryEntry("leg-press")?.name).toBe("Leg press");
    expect(libraryEntry("nao-existe")).toBeUndefined();
    expect(libraryEntry(undefined)).toBeUndefined();
    expect(isLibraryKey("stiff")).toBe(true);
    expect(isLibraryKey("Stiff")).toBe(false);
  });
});

describe("reconhecer exercícios já cadastrados", () => {
  it("normaliza acentos, caixa, pontuação e espaços", () => {
    expect(normalizeExerciseName("  Tríceps   Pulley! ")).toBe("triceps pulley");
    expect(normalizeExerciseName("Agachamento búlgaro")).toBe("agachamento bulgaro");
  });

  it("casa pelo nome ou por um apelido comum (os exercícios iniciais de toda conta)", () => {
    expect(matchLibrary("Supino reto")?.key).toBe("supino-reto-barra");
    expect(matchLibrary("supino inclinado com halteres")?.key).toBe("supino-inclinado-halteres");
    expect(matchLibrary("Serrote")?.key).toBe("remada-unilateral");
    expect(matchLibrary("PECK DECK")?.key).toBe("crucifixo-maquina");
    for (const name of ["Barra fixa", "Puxada frontal", "Remada curvada", "Rosca direta", "Agachamento livre", "Panturrilha em pé", "Elevação lateral"]) {
      expect(matchLibrary(name), name).not.toBeNull();
    }
  });

  it("na dúvida, não casa", () => {
    expect(matchLibrary("Supino")?.key).toBe("supino-reto-barra"); // apelido explícito
    expect(matchLibrary("Supino com pausa")).toBeNull();
    expect(matchLibrary("")).toBeNull();
    expect(matchLibrary("Meu exercício")).toBeNull();
  });
});

describe("busca no cadastro", () => {
  it("todas as palavras precisam aparecer, em qualquer ordem e sem acento", () => {
    const names = searchLibrary("halteres supino").map((e) => e.key);
    expect(names).toEqual(expect.arrayContaining(["supino-reto-halteres", "supino-inclinado-halteres"]));
    expect(names).not.toContain("supino-reto-barra");
    expect(searchLibrary("triceps").every((e) => e.group === "Tríceps" || /triceps/.test(normalizeExerciseName(e.name)))).toBe(true);
  });

  it("o nome que começa com o texto vem primeiro", () => {
    expect(searchLibrary("rosca")[0].key).toBe("rosca-direta");
    expect(searchLibrary("leg")[0].key).toBe("leg-press");
  });

  it("acha pelo apelido e respeita o limite", () => {
    expect(searchLibrary("hip thrust").map((e) => e.key)).toEqual(["elevacao-pelvica"]);
    expect(searchLibrary("a", 3)).toHaveLength(3);
    expect(searchLibrary("   ")).toEqual([]);
  });
});
