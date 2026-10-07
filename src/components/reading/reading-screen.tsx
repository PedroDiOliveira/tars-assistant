"use client";

import { useMemo, useState } from "react";
import { BookOpen, Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withStoreGate } from "@/components/layout/store-gate";
import { GoalSheet } from "@/components/goals/goal-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { MiniBars } from "@/components/shared/mini-bars";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { bookProgress } from "@/domain/reading";
import { readingWeekSummary } from "@/domain/summary";
import type { BookStatus } from "@/domain/types";
import { useData, useToday } from "@/data";
import { WEEK_LABELS } from "@/lib/constants";
import { pluralize } from "@/lib/format";
import { BookCover } from "./book-cover";
import { BookDetailSheet } from "./book-detail-sheet";
import { BookSheet } from "./book-sheet";
import { ReadingSessionSheet } from "./reading-session-sheet";

const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Lendo",
  want: "Quero ler",
  paused: "Pausado",
  done: "Concluído",
};

function ReadingScreenContent() {
  const data = useData();
  const today = useToday();
  const week = useMemo(() => readingWeekSummary(data, today), [data, today]);

  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionBook, setSessionBook] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  // Lista única, com os livros em leitura primeiro.
  const books = useMemo(() => {
    const order: BookStatus[] = ["reading", "want", "paused", "done"];
    return [...data.books].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  }, [data.books]);

  const remaining = week.target ? Math.max(0, week.target - week.pages) : 0;

  function openSession(bookId: string | null) {
    setSessionBook(bookId);
    setSessionOpen(true);
  }

  return (
    <div data-module="reading" className="space-y-6 px-4">
      {/* Livro atual */}
      {week.book ? (
        <Surface className="p-5">
          <div className="flex items-center gap-4">
            <BookCover title={week.book.title} className="h-20 w-14 text-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground">Lendo agora</p>
              <p className="mt-0.5 text-lg leading-snug font-semibold">{week.book.title}</p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                Página {week.currentPage} de {week.totalPages} · {week.bookPercent}%
              </p>
            </div>
          </div>
          <ProgressBar
            className="mt-4 h-1.5"
            ratio={week.bookRatio}
            label={`Progresso de ${week.book.title}`}
          />
          <Button size="lg" className="mt-4 w-full" onClick={() => openSession(week.book?.id ?? null)}>
            Registrar leitura
          </Button>
        </Surface>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Nenhum livro em andamento"
          description="Adicione um livro para acompanhar a leitura."
          action={
            <Button onClick={() => setBookOpen(true)}>
              <Plus aria-hidden /> Adicionar livro
            </Button>
          }
        />
      )}

      {/* Semana */}
      <Surface className="p-5">
        <button type="button" className="w-full text-left" onClick={() => setGoalOpen(true)}>
          <p className="text-sm font-medium text-muted-foreground">Esta semana</p>
          <p className="mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums">
            {week.pages}
            {week.target ? (
              <span className="text-xl font-semibold text-muted-foreground"> de {week.target}</span>
            ) : null}
            <span className="ml-2 text-base font-medium text-muted-foreground">
              {pluralize(week.target ?? week.pages, "página", "páginas")}
            </span>
          </p>
          {week.target ? (
            <ProgressBar className="mt-3 h-1.5" ratio={week.ratio} label="Progresso da meta semanal de leitura" />
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {week.target
              ? remaining === 0
                ? "Meta da semana batida"
                : `Faltam ${remaining} ${pluralize(remaining, "página", "páginas")}`
              : "Toque para definir uma meta semanal"}
          </p>
        </button>

        <MiniBars
          className="mt-4"
          summary={`Páginas por dia nesta semana: ${week.byDay.map((d, i) => `${WEEK_LABELS[i]} ${d.pages}`).join(", ")}`}
          items={week.byDay.map((d, i) => ({
            label: WEEK_LABELS[i],
            value: d.pages,
            display: String(d.pages),
            highlight: d.date === today,
            future: d.date > today,
          }))}
        />

        {week.streak.weeks > 0 ? (
          <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-medium text-m-ink">
            <Flame className="size-4" aria-hidden />
            {week.streak.weeks} {pluralize(week.streak.weeks, "semana seguida", "semanas seguidas")} na meta
          </p>
        ) : null}
      </Surface>

      {/* Livros */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold">Meus livros</h2>
          <Button variant="ghost" size="sm" onClick={() => setBookOpen(true)}>
            <Plus aria-hidden /> Livro
          </Button>
        </div>
        <Surface className="divide-y divide-border/60 overflow-hidden">
          {books.map((book) => {
            const progress = bookProgress(book, data.readingSessions);
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => {
                  setDetailId(book.id);
                  setDetailOpen(true);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60"
              >
                <BookCover title={book.title} className="h-12 w-9 text-base" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{book.title}</p>
                  <p className="truncate text-sm text-muted-foreground tabular-nums">
                    {STATUS_LABEL[book.status]}
                    {book.status !== "want" ? ` · ${progress.percent}%` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </Surface>
      </section>

      <ReadingSessionSheet open={sessionOpen} onOpenChange={setSessionOpen} bookId={sessionBook} />
      <BookSheet open={bookOpen} onOpenChange={setBookOpen} />
      <BookDetailSheet open={detailOpen} onOpenChange={setDetailOpen} bookId={detailId} />
      <GoalSheet
        open={goalOpen}
        onOpenChange={setGoalOpen}
        target={{ kind: "reading_pages", scopeId: null, title: "Meta semanal de leitura", current: week.target }}
      />
    </div>
  );
}

export const ReadingScreen = withStoreGate(ReadingScreenContent);
