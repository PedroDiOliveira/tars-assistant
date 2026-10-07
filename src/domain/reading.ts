import { inPeriod, type DateKey, type Period } from "@/lib/dates";
import type { Book, ReadingSession } from "./types";

/**
 * Convenção: início e fim são a posição no livro antes e depois da sessão.
 * Ler da posição 30 até a 50 registra 20 páginas.
 */
export function pagesRead(session: Pick<ReadingSession, "startPage" | "endPage">): number {
  return Math.max(0, session.endPage - session.startPage);
}

/** Mensagem de erro em português, ou null quando a sessão é válida. */
export function validateReadingSession(
  book: Pick<Book, "totalPages">,
  startPage: number,
  endPage: number,
): string | null {
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
    return "Use números inteiros nas páginas.";
  }
  if (startPage < 0 || endPage < 0) return "As páginas não podem ser negativas.";
  if (endPage > book.totalPages) return `O livro tem ${book.totalPages} páginas.`;
  if (endPage <= startPage) return "A página final deve ser maior que a inicial.";
  return null;
}

export function sessionsOfBook(sessions: ReadingSession[], bookId: string): ReadingSession[] {
  return sessions.filter((s) => s.bookId === bookId);
}

/**
 * Posição atual: a maior posição já alcançada (leitura linear). Recalcula sozinha quando uma
 * sessão é editada ou apagada, sem somar páginas em duplicidade.
 */
export function currentPage(book: Book, sessions: ReadingSession[]): number {
  const furthest = sessionsOfBook(sessions, book.id).reduce(
    (max, s) => Math.max(max, s.endPage),
    book.initialPage,
  );
  return Math.min(furthest, book.totalPages);
}

export interface BookProgress {
  current: number;
  total: number;
  ratio: number;
  percent: number;
}

export function bookProgress(book: Book, sessions: ReadingSession[]): BookProgress {
  const current = currentPage(book, sessions);
  const ratio = book.totalPages > 0 ? current / book.totalPages : 0;
  return { current, total: book.totalPages, ratio, percent: Math.round(ratio * 100) };
}

/** Só sessões entram: a página inicial do cadastro nunca vira "leitura do período". */
export function pagesInPeriod(
  sessions: ReadingSession[],
  period: Period,
  bookId?: string,
): number {
  return sessions
    .filter((s) => inPeriod(s.occurredOn, period) && (!bookId || s.bookId === bookId))
    .reduce((sum, s) => sum + pagesRead(s), 0);
}

export function pagesByDay(sessions: ReadingSession[], days: DateKey[]): number[] {
  return days.map((day) =>
    sessions.filter((s) => s.occurredOn === day).reduce((sum, s) => sum + pagesRead(s), 0),
  );
}

export function lastReadDate(sessions: ReadingSession[], bookId: string): DateKey | null {
  const dates = sessionsOfBook(sessions, bookId).map((s) => s.occurredOn);
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}

/** Livro "em foco": entre os que estão sendo lidos, o de leitura mais recente. */
export function pickCurrentBook(books: Book[], sessions: ReadingSession[]): Book | null {
  const reading = books.filter((b) => b.status === "reading");
  if (reading.length === 0) return null;
  return [...reading].sort((a, b) => {
    const da = lastReadDate(sessions, a.id) ?? "";
    const db = lastReadDate(sessions, b.id) ?? "";
    return da < db ? 1 : da > db ? -1 : 0;
  })[0];
}

export function sortReadingSessionsDesc(sessions: ReadingSession[]): ReadingSession[] {
  return [...sessions].sort((a, b) =>
    a.occurredOn !== b.occurredOn ? (a.occurredOn < b.occurredOn ? 1 : -1) : a.id < b.id ? 1 : -1,
  );
}
