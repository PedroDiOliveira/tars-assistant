"use client";

import { useMemo, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import { BookOpen, CheckCircle2, Flame, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { MiniBars } from "@/components/shared/mini-bars";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SectionTitle } from "@/components/shared/section-title";
import { Segmented } from "@/components/shared/segmented";
import { Surface } from "@/components/shared/surface";
import { bookProgress } from "@/domain/reading";
import { progressPercent } from "@/domain/progress";
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
const STATUS_ORDER: BookStatus[] = ["reading", "want", "paused", "done"];

function ReadingScreenContent() {
  const data = useData();
  const today = useToday();
  const week = useMemo(() => readingWeekSummary(data, today), [data, today]);

  const [filter, setFilter] = useState<BookStatus>("reading");
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionBook, setSessionBook] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState<GoalTarget | null>(null);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_ORDER.map((s) => [s, data.books.filter((b) => b.status === s).length]),
      ) as Record<BookStatus, number>,
    [data.books],
  );
  const shown = data.books.filter((b) => b.status === filter);
  const percent = progressPercent(week.pages, week.target);
  const remaining = week.target ? Math.max(0, week.target - week.pages) : 0;

  function openSession(bookId: string | null) {
    setSessionBook(bookId);
    setSessionOpen(true);
  }

  function openGoal() {
    setGoalTarget({
      kind: "reading_pages",
      scopeId: null,
      title: "Meta semanal de leitura",
      current: week.target,
    });
    setGoalOpen(true);
  }

  return (
    <div data-module="reading" className="space-y-6 px-4 pb-6">
      {/* Livro em foco */}
      {week.book ? (
        <Surface className="space-y-4 p-4">
          <div className="flex items-center gap-4">
            <BookCover title={week.book.title} className="h-24 w-16 text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground">Lendo agora</p>
              <p className="mt-0.5 text-lg leading-snug font-semibold">{week.book.title}</p>
              {week.book.author ? <p className="text-sm text-muted-foreground">{week.book.author}</p> : null}
              <p className="mt-2 text-sm tabular-nums">
                Página <span className="font-semibold">{week.currentPage}</span> de {week.totalPages} ·{" "}
                {week.bookPercent}%
              </p>
            </div>
          </div>
          <ProgressBar ratio={week.bookRatio} label={`Progresso de ${week.book.title}`} />
          <Button size="lg" className="w-full" onClick={() => openSession(week.book?.id ?? null)}>
            Registrar leitura
          </Button>
        </Surface>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Nenhum livro em andamento"
          description="Adicione um livro ou comece a ler um da sua lista."
          action={
            <Button onClick={() => setBookOpen(true)}>
              <Plus aria-hidden /> Adicionar livro
            </Button>
          }
        />
      )}

      {/* Esta semana */}
      <Surface className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Leitura · esta semana</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">
              {week.pages}
              {week.target ? (
                <span className="text-base font-medium text-muted-foreground"> de {week.target} páginas</span>
              ) : (
                <span className="text-base font-medium text-muted-foreground">
                  {" "}
                  {pluralize(week.pages, "página", "páginas")}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {percent !== null ? (
              <span className="rounded-full bg-m-soft px-2 py-0.5 text-xs font-semibold text-m-ink tabular-nums">
                {percent}%
              </span>
            ) : null}
            <Button variant="ghost" size="icon" aria-label="Editar meta semanal de leitura" onClick={openGoal}>
              <Pencil aria-hidden />
            </Button>
          </div>
        </div>
        {week.target ? (
          <>
            <ProgressBar ratio={week.ratio} label="Progresso da meta semanal de leitura" />
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {remaining === 0 ? (
                <>
                  <CheckCircle2 className="size-4 text-success-ink" aria-hidden /> Meta da semana batida
                </>
              ) : (
                `Faltam ${remaining} ${pluralize(remaining, "página", "páginas")} para a meta`
              )}
            </p>
          </>
        ) : (
          <Button variant="outline" className="w-full" onClick={openGoal}>
            Definir meta semanal
          </Button>
        )}
        <MiniBars
          className="pt-1"
          summary={`Páginas lidas por dia nesta semana: ${week.byDay
            .map((d, i) => `${WEEK_LABELS[i]} ${d.pages}`)
            .join(", ")}`}
          items={week.byDay.map((d, i) => ({
            label: WEEK_LABELS[i],
            value: d.pages,
            display: String(d.pages),
            highlight: d.date === today,
            future: d.date > today,
          }))}
        />
        {week.streak.weeks > 0 ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-m-ink">
            <Flame className="size-4" aria-hidden />
            {week.streak.weeks} {pluralize(week.streak.weeks, "semana seguida", "semanas seguidas")} batendo a meta
          </p>
        ) : null}
      </Surface>

      {/* Livros */}
      <section className="space-y-3">
        <SectionTitle
          action={
            <Button variant="secondary" size="sm" onClick={() => setBookOpen(true)}>
              <Plus aria-hidden /> Livro
            </Button>
          }
        >
          Meus livros
        </SectionTitle>
        <Segmented<BookStatus>
          ariaLabel="Filtrar livros por situação"
          value={filter}
          onChange={setFilter}
          options={STATUS_ORDER.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} ${counts[s]}` }))}
          className="[&_button]:px-1 [&_button]:text-xs"
        />
        {shown.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={`Nenhum livro em “${STATUS_LABEL[filter].toLowerCase()}”`}
            description="Mude a situação de um livro ou adicione um novo."
          />
        ) : (
          <Surface className="p-1">
            {shown.map((book) => {
              const progress = bookProgress(book, data.readingSessions);
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => {
                    setDetailId(book.id);
                    setDetailOpen(true);
                  }}
                  className="flex min-h-20 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition active:bg-muted/70"
                >
                  <BookCover title={book.title} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div>
                      <p className="truncate font-medium">{book.title}</p>
                      {book.author ? <p className="truncate text-sm text-muted-foreground">{book.author}</p> : null}
                    </div>
                    <ProgressBar ratio={progress.ratio} label={`Progresso de ${book.title}`} className="h-1.5" />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Página {progress.current} de {progress.total} · {progress.percent}%
                    </p>
                  </div>
                </button>
              );
            })}
          </Surface>
        )}
      </section>

      <ReadingSessionSheet open={sessionOpen} onOpenChange={setSessionOpen} bookId={sessionBook} />
      <BookSheet open={bookOpen} onOpenChange={setBookOpen} />
      <BookDetailSheet open={detailOpen} onOpenChange={setDetailOpen} bookId={detailId} />
      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
    </div>
  );
}

export const ReadingScreen = withStoreGate(ReadingScreenContent);
