"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Segmented } from "@/components/shared/segmented";
import { Sheet } from "@/components/shared/sheet";
import { bookProgress, pagesRead, sessionsOfBook, sortReadingSessionsDesc } from "@/domain/reading";
import type { BookStatus } from "@/domain/types";
import { useActions, useData, useToday } from "@/data";
import { formatDayRelative } from "@/lib/format";
import { BookCover } from "./book-cover";

interface BookDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string | null;
}

export function BookDetailSheet({ open, onOpenChange, bookId }: BookDetailSheetProps) {
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
      {book ? <BookDetail bookId={book.id} /> : null}
    </Sheet>
  );
}

const STATUS_OPTIONS: { value: BookStatus; label: string }[] = [
  { value: "reading", label: "Lendo" },
  { value: "want", label: "Quero ler" },
  { value: "paused", label: "Pausado" },
  { value: "done", label: "Concluído" },
];

function BookDetail({ bookId }: { bookId: string }) {
  const data = useData();
  const today = useToday();
  const { setBookStatus, deleteReadingSession } = useActions();
  const [toDelete, setToDelete] = useState<string | null>(null);

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
          onChange={(status) => setBookStatus(book.id, status)}
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{formatDayRelative(s.occurredOn, today)}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Página {s.startPage} → {s.endPage} · {pagesRead(s)} págs.
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Excluir sessão" onClick={() => setToDelete(s.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir esta sessão de leitura?"
        description="A posição do livro e as páginas da semana serão recalculadas."
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (toDelete) deleteReadingSession(toDelete);
          setToDelete(null);
          toast.success("Sessão excluída");
        }}
      />
    </div>
  );
}
