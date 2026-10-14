import { describe, expect, it } from "vitest";
import { displayInitial, MAX_DISPLAY_NAME_LENGTH, parseDisplayName } from "./profile";

const name = (raw: unknown) => {
  const result = parseDisplayName(raw);
  return result.ok ? result.name : `ERRO: ${result.error}`;
};

const INVISIBLE = "ERRO: O nome não pode ter quebras de linha, caracteres de controle ou invisíveis.";
const TOO_LONG = "ERRO: O nome pode ter no máximo 60 caracteres.";
const EMPTY = "ERRO: Informe um nome.";

describe("parseDisplayName: o que é aceito", () => {
  it.each([
    ["Pedro", "Pedro"],
    ["João da Silva", "João da Silva"],
    ["D'Ávila", "D'Ávila"],
    ["Maria-Clara", "Maria-Clara"],
    ["Pedro H. S.", "Pedro H. S."],
    ["Zoë", "Zoë"],
    ["李雷", "李雷"],
    ["Pedro 🚀", "Pedro 🚀"],
    ["R2D2", "R2D2"],
  ])("aceita %j", (raw, expected) => {
    expect(name(raw)).toBe(expected);
  });

  it("tira espaços das pontas e junta os repetidos", () => {
    expect(name("   Pedro    Henrique  ")).toBe("Pedro Henrique");
  });

  it("trata o espaço não separável e outros espaços Unicode como espaço comum", () => {
    expect(name("Pedro\u00a0Henrique")).toBe("Pedro Henrique");
    expect(name("\u3000Pedro\u2003\u2003Henrique\u202f")).toBe("Pedro Henrique");
  });

  it("normaliza para NFC: 'a' + til vira 'ã'", () => {
    expect(name("Joa\u0303o")).toBe("João");
    expect(name("Joa\u0303o")).toBe(name("João"));
  });
});

describe("parseDisplayName: o que é recusado", () => {
  it.each([undefined, null, 42, {}, ["Pedro"], true])("recusa o que não é texto (%j)", (raw) => {
    expect(name(raw)).toBe(EMPTY);
  });

  it.each(["", "   ", "\u00a0\u3000"])("recusa vazio ou só espaços (%j)", (raw) => {
    expect(name(raw)).toBe(EMPTY);
  });

  it.each([
    ["quebra de linha", "Pedro\nHenrique"],
    ["tab", "Pedro\tHenrique"],
    ["quebra de linha no fim (não é 'espaço')", "Pedro\n"],
    ["caractere nulo", "Pedro\u0000"],
    ["controle C1", "Pedro\u0085"],
    ["largura zero", "Pe\u200bdro"],
    ["junção de largura zero", "Pe\u200ddro"],
    ["marca da esquerda para a direita", "Pedro\u200e"],
    ["inversão de direção (spoofing)", "\u202eordeP"],
    ["isolamento bidirecional", "Pedro\u2066"],
    ["hífen suave", "Pe\u00addro"],
    ["BOM", "\ufeffPedro"],
    ["separador de linha", "Pedro\u2028Henrique"],
    ["separador de parágrafo", "Pedro\u2029Henrique"],
    ["uso privado", "Pedro\ue000"],
    ["caractere de tag", "Pedro\u{e0041}"],
    ["substituto solto", "Pedro\ud800"],
  ])("recusa %s", (_label, raw) => {
    expect(name(raw)).toBe(INVISIBLE);
  });

  it("recusa mais que o limite, contando pontos de código (não unidades UTF-16)", () => {
    expect(name("a".repeat(MAX_DISPLAY_NAME_LENGTH))).toBe("a".repeat(MAX_DISPLAY_NAME_LENGTH));
    expect(name("a".repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toBe(TOO_LONG);
    // Cada emoji é 2 unidades UTF-16 mas 1 ponto de código: 59 emojis + 1 letra = 60 cabem; 60 + 1 não.
    const fits = "😀".repeat(MAX_DISPLAY_NAME_LENGTH - 1) + "a";
    expect(name(fits)).toBe(fits);
    expect(name("😀".repeat(MAX_DISPLAY_NAME_LENGTH) + "a")).toBe(TOO_LONG);
  });

  it("recusa um texto absurdamente grande sem processá-lo", () => {
    expect(name("a".repeat(1_000_000))).toBe(TOO_LONG);
  });

  it("recusa pilhas de acentos (zalgo), mas aceita os de verdade", () => {
    // O NFC funde o primeiro sinal à letra ("a" + acento = "á"), então 5 sinais soltos sobram 4 (o limite) e 6 sobram 5.
    expect(name("a" + "\u0301".repeat(5))).not.toMatch(/^ERRO/);
    expect(name("a" + "\u0301".repeat(6))).toBe("ERRO: O nome tem acentos demais em sequência.");
    // vietnamita decomposto: "e" + circunflexo + til (2 sinais) vira "ễ" na normalização
    expect(name("Nguye\u0302\u0303n")).toBe("Nguyễn");
  });

  it.each(["...", "---", "🚀", "!!!"])("exige ao menos uma letra ou número (%j)", (raw) => {
    expect(name(raw)).toBe("ERRO: Use pelo menos uma letra ou um número.");
  });
});

describe("parseDisplayName: segurança do texto aceito", () => {
  it("aceita (como texto puro) o que parece HTML: quem exibe nunca interpreta", () => {
    // O React escapa; a regra de nome não tenta ser um filtro de HTML (isso estragaria "D'Ávila" e afins).
    expect(name("<b>Pedro</b>")).toBe("<b>Pedro</b>");
  });

  it("é idempotente: normalizar o resultado não muda nada", () => {
    for (const raw of ["  Pedro\u00a0\u00a0H  ", "Joa\u0303o", "Ana"]) {
      const once = parseDisplayName(raw);
      if (!once.ok) throw new Error("fixture inválida");
      expect(parseDisplayName(once.name)).toEqual(once);
    }
  });
});

describe("displayInitial", () => {
  it("devolve a primeira letra em maiúscula", () => {
    expect(displayInitial("pedro")).toBe("P");
    expect(displayInitial("  ana")).toBe("A");
    expect(displayInitial("émerson")).toBe("É");
  });

  it("não parte um emoji nem uma letra decomposta ao meio", () => {
    expect(displayInitial("🚀 Pedro")).toBe("🚀");
    expect(displayInitial("a\u0303na")).toBe("Ã");
  });

  it("usa '?' quando não há nome", () => {
    expect(displayInitial("")).toBe("?");
    expect(displayInitial("   ")).toBe("?");
  });
});
