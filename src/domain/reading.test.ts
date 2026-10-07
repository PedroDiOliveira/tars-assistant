import { describe, expect, it } from "vitest";
import {
  bookProgress,
  currentPage,
  pagesInPeriod,
  pagesRead,
  pickCurrentBook,
  validateReadingSession,
} from "./reading";
import type { Book, ReadingSession } from "./types";

const book = (over: Partial<Book> = {}): Book => ({
  id: "b1",
  title: "Hábitos Atômicos",
  totalPages: 320,
  initialPage: 0,
  status: "reading",
  ...over,
});

const session = (over: Partial<ReadingSession>): ReadingSession => ({
  id: "s",
  bookId: "b1",
  occurredOn: "2026-10-06",
  startPage: 0,
  endPage: 0,
  ...over,
});

describe("páginas lidas", () => {
  it("ler da posição 30 até a 50 registra 20 páginas", () => {
    expect(pagesRead({ startPage: 30, endPage: 50 })).toBe(20);
  });

  it("a página inicial do cadastro não vira leitura do período", () => {
    const b = book({ initialPage: 120 });
    expect(currentPage(b, [])).toBe(120);
    expect(pagesInPeriod([], { start: "2026-10-05", end: "2026-10-11" })).toBe(0);
  });

  it("soma só sessões dentro do período (semana de segunda a domingo)", () => {
    const sessions = [
      session({ id: "1", occurredOn: "2026-10-04", startPage: 0, endPage: 10 }), // domingo anterior
      session({ id: "2", occurredOn: "2026-10-05", startPage: 10, endPage: 30 }),
      session({ id: "3", occurredOn: "2026-10-11", startPage: 30, endPage: 45 }),
      session({ id: "4", occurredOn: "2026-10-12", startPage: 45, endPage: 60 }), // próxima segunda
    ];
    expect(pagesInPeriod(sessions, { start: "2026-10-05", end: "2026-10-11" })).toBe(35);
  });

  it("apagar uma sessão recalcula a posição sem somar páginas em duplicidade", () => {
    const sessions = [
      session({ id: "1", startPage: 0, endPage: 30 }),
      session({ id: "2", startPage: 30, endPage: 50 }),
    ];
    expect(currentPage(book(), sessions)).toBe(50);
    expect(currentPage(book(), sessions.filter((s) => s.id !== "2"))).toBe(30);
  });

  it("progresso do livro usa posição atual / total", () => {
    const sessions = [session({ startPage: 0, endPage: 160 })];
    const progress = bookProgress(book(), sessions);
    expect(progress.current).toBe(160);
    expect(progress.percent).toBe(50);
  });
});

describe("validação da sessão", () => {
  it("aceita posições entre 0 e o total, com fim maior que o início", () => {
    expect(validateReadingSession(book(), 30, 50)).toBeNull();
    expect(validateReadingSession(book(), 0, 320)).toBeNull();
  });

  it("rejeita fim <= início, negativos e acima do total", () => {
    expect(validateReadingSession(book(), 50, 50)).not.toBeNull();
    expect(validateReadingSession(book(), 50, 30)).not.toBeNull();
    expect(validateReadingSession(book(), -1, 10)).not.toBeNull();
    expect(validateReadingSession(book(), 300, 321)).not.toBeNull();
    expect(validateReadingSession(book(), 1.5, 10)).not.toBeNull();
  });
});

describe("livro em foco", () => {
  it("escolhe, entre os que estão lendo, o de leitura mais recente", () => {
    const a = book({ id: "a" });
    const b = book({ id: "b" });
    const done = book({ id: "c", status: "done" });
    const sessions = [
      session({ id: "1", bookId: "a", occurredOn: "2026-10-01", startPage: 0, endPage: 5 }),
      session({ id: "2", bookId: "b", occurredOn: "2026-10-05", startPage: 0, endPage: 5 }),
      session({ id: "3", bookId: "c", occurredOn: "2026-10-06", startPage: 0, endPage: 5 }),
    ];
    expect(pickCurrentBook([a, b, done], sessions)?.id).toBe("b");
    expect(pickCurrentBook([done], sessions)).toBeNull();
  });
});
