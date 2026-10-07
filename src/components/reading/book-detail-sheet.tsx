"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Segmented } from "@/components/shared/segmented";
import { Sheet } from "@/components/shared/sheet";
import { bookProgress, pagesRead, sessionsOfBook, sortReadingSessionsDesc } from "@/domain/reading";
import type { Book, BookStatus, ReadingSession } from "@/domain/types";
import { useActions, useData, useToday } from "@/data";
import { formatDayRelative } from "@/lib/format";
import { BookCover } from "./book-cover";
import { notify } from "@/components/shared/notify";

interface BookDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string | null;
  /** quem controla as sheets abre a de edição (sem aninhar drawers) */
  onEditBook: (book: Book) => void;
  onEditSession: (session: ReadingSession) => void;
}

export function BookDetailSheet({ open, onOpenChange, bookId, onEditBook, onEditSession }: BookDetailSheetProps) {
  const { books } = useData();
  const book = books.find((b) => b.id === bookId);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={book?.title ?? "Livro"}
      description={book?.author}
      module="reading"
    >
      {book ? (
        <BookDetail
          bookId={book.id}
          onClose={() => onOpenChange(false)}
          onEditBook={onEditBook}
          onEditSession={onEditSession}
        />
      ) : null}
    </Sheet>
  );
}

const STATUS_OPTIONS: { value: BookStatus; label: string }[] = [
  { value: "reading", label: "Lendo" },
  { value: "want", label: "Quero ler" },
  { value: "paused", label: "Pausado" },
  { value: "done", label: "Concluído" },
];

function BookDetail({
  bookId,
  onClose,
  onEditBook,
  onEditSession,
}: {
  bookId: string;
  onClose: () => void;
  onEditBook: (book: Book) => void;
  onEditSession: (session: ReadingSession) => void;
}) {
  const data = useData();
  const today = useToday();
  const { setBookStatus, deleteReadingSession, deleteBook } = useActions();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [deleteBookOpen, setDeleteBookOpen] = useState(false);

  const book = data.books.find((b) => b.id === bookId);
  if (!book) return null;
  const progress = bookProgress(book, data.readingSessions);
  const sessions = sortReadingSessionsDesc(sessionsOfBook(data.readingSessions, book.id));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BookCover title={book.title} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm tabular-nums">
            Página <span className="font-semibold">{progress.current}</span> de {progress.total} · {progress.percent}%
          </p>
          <ProgressBar ratio={progress.ratio} label="Progresso do livro" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Situação</p>
        <Segmented
          ariaLabel="Situação do livro"
          value={book.status}
          onChange={(status) => void setBookStatus(book.id, status).then(notify)}
          options={STATUS_OPTIONS}
          className="[&_button]:px-1 [&_button]:text-xs"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Sessões de leitura</p>
        {sessions.length === 0 ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            Nenhuma sessão registrada ainda.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {sessions.slice(0, 10).map((s) => (
              <li key={s.id} className="flex min-h-14 items-center gap-3 px-3">
                <button
                  type="button"
                  aria-label={`Editar leitura de ${formatDayRelative(s.occurredOn, today)}`}
                  onClick={() => onEditSession(s)}
                  className="min-w-0 flex-1 py-2 text-left"
                >
                  <p className="text-sm font-medium">{formatDayRelative(s.occurredOn, today)}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Página {s.startPage} → {s.endPage} · {pagesRead(s)} págs.
                  </p>
                </button>
                <Button variant="ghost" size="icon" aria-label="Excluir sessão" onClick={() => setToDelete(s.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <Button variant="outline" size="lg" className="w-full justify-start" onClick={() => onEditBook(book)}>
          <Pencil aria-hidden /> Editar livro
        </Button>
        <Button variant="ghost" size="lg" className="w-full justify-start text-destructive" onClick={() => setDeleteBookOpen(true)}>
          <Trash2 aria-hidden /> Excluir livro
        </Button>
      </div>

      <ConfirmDialog
        open={deleteBookOpen}
        onOpenChange={setDeleteBookOpen}
        title={`Excluir “${book.title}”?`}
        description={
          sessions.length === 0
            ? "O livro será removido. Não há leituras registradas nele."
            : `O livro e as ${sessions.length} ${sessions.length === 1 ? "leitura registrada" : "leituras registradas"} nele serão apagados. As páginas deixam de contar nas semanas em que foram lidas. Isto não pode ser desfeito.`
        }
        confirmLabel="Excluir livro"
        destructive
        onConfirm={async () => {
          if (notify(await deleteBook(book.id), "Livro excluído")) onClose();
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir esta sessão de leitura?"
        description="A posição do livro e as páginas da semana serão recalculadas."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          const id = toDelete;
          setToDelete(null);
          if (id) notify(await deleteReadingSession(id), "Sessão excluída");
        }}
      />
    </div>
  );
}
