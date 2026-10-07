"use client";

import { useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { currentPage, pagesRead, pickCurrentBook, validateReadingSession } from "@/domain/reading";
import type { ReadingSession } from "@/domain/types";
import { useActions, useData, useToday } from "@/data";
import { addDays, isValidDateKey, type DateKey } from "@/lib/dates";
import { pluralize } from "@/lib/format";
import { notify } from "@/components/shared/notify";

interface ReadingSessionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** livro pré-selecionado; sem ele, usa o livro em foco */
  bookId?: string | null;
  /** leitura a editar; sem ela, registra uma nova */
  session?: ReadingSession | null;
}

export function ReadingSessionSheet({ open, onOpenChange, bookId, session = null }: ReadingSessionSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={session ? "Editar leitura" : "Registrar leitura"}
      description={session ? "Corrija as páginas ou a data desta leitura." : "Informe até que página você chegou."}
      module="reading"
    >
      {open ? <ReadingSessionForm key={session?.id ?? "new"} bookId={bookId ?? null} session={session} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function ReadingSessionForm({ bookId, session, onDone }: { bookId: string | null; session: ReadingSession | null; onDone: () => void }) {
  const data = useData();
  const today = useToday();
  const { addReadingSession, updateReadingSession } = useActions();

  // Registrar: qualquer livro não concluído pode receber leitura. Editar: só o livro da própria leitura.
  const editingBook = session ? (data.books.find((b) => b.id === session.bookId) ?? null) : null;
  const candidates = session ? (editingBook ? [editingBook] : []) : data.books.filter((b) => b.status !== "done");
  const initialBook =
    editingBook ??
    candidates.find((b) => b.id === bookId) ??
    pickCurrentBook(data.books, data.readingSessions) ??
    candidates[0] ??
    null;

  const [selectedId, setSelectedId] = useState<string | null>(initialBook?.id ?? null);
  const book = data.books.find((b) => b.id === selectedId) ?? null;
  const [startText, setStartText] = useState<string>(
    session ? String(session.startPage) : initialBook ? String(currentPage(initialBook, data.readingSessions)) : "0",
  );
  const [endText, setEndText] = useState(session ? String(session.endPage) : "");
  const [date, setDate] = useState<DateKey>(session?.occurredOn ?? today);
  const submitted = useRef(false);

  if (!book) {
    return (
      <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        Não há livros disponíveis. Adicione um livro na tela de Leitura para registrar sessões.
      </p>
    );
  }

  const start = Number(startText);
  const end = Number(endText);
  const endFilled = endText.trim() !== "";
  const error = endFilled ? validateReadingSession(book, start, end) : null;
  const valid = endFilled && error === null && isValidDateKey(date);
  const pages = valid ? pagesRead({ startPage: start, endPage: end }) : 0;

  function pickBook(id: string) {
    const next = data.books.find((b) => b.id === id);
    if (!next) return;
    setSelectedId(id);
    setStartText(String(currentPage(next, data.readingSessions)));
    setEndText("");
  }

  async function save() {
    if (submitted.current || !valid || !book) return;
    submitted.current = true;
    const result = session
      ? await updateReadingSession(session.id, { occurredOn: date, startPage: start, endPage: end, notes: session.notes })
      : await addReadingSession({ bookId: book.id, occurredOn: date, startPage: start, endPage: end });
    const message = session
      ? "Leitura atualizada"
      : `${pages} ${pluralize(pages, "página registrada", "páginas registradas")} em ${book.title}`;
    if (!notify(result, message)) {
      submitted.current = false;
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-5">
      {candidates.length > 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Livro</p>
          <div role="radiogroup" aria-label="Livro" className="flex flex-wrap gap-2">
            {candidates.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={b.id === book.id}
                onClick={() => pickBook(b.id)}
                className={cn(
                  "min-h-11 max-w-full truncate rounded-full border px-3.5 text-sm font-medium transition",
                  b.id === book.id ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
                )}
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-base font-semibold">{book.title}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Página inicial</span>
          <Input
            inputMode="numeric"
            value={startText}
            onChange={(e) => setStartText(e.target.value.replace(/\D/g, ""))}
            className="text-center text-xl font-semibold tabular-nums"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Página final</span>
          <Input
            autoFocus
            inputMode="numeric"
            value={endText}
            placeholder={String(book.totalPages)}
            onChange={(e) => setEndText(e.target.value.replace(/\D/g, ""))}
            aria-invalid={error ? true : undefined}
            className="text-center text-xl font-semibold tabular-nums"
          />
        </label>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Posições entre 0 e {book.totalPages}. Da {start || 0} à {endFilled ? end : "…"} conta{" "}
        {valid ? pages : "a diferença"}
        {valid ? ` ${pluralize(pages, "página", "páginas")}` : ""}.
      </p>
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">Data</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Hoje", value: today },
            { label: "Ontem", value: addDays(today, -1) },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={date === o.value}
              onClick={() => setDate(o.value)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition",
                date === o.value ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
              )}
            >
              {o.label}
            </button>
          ))}
          <Input
            type="date"
            aria-label="Outra data"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-auto min-w-40 flex-1 rounded-full"
          />
        </div>
      </div>

      <SheetFooter>
        <Button size="lg" disabled={!valid} onClick={save}>
          {session ? "Salvar alterações" : "Registrar leitura"}
        </Button>
      </SheetFooter>
    </div>
  );
}
