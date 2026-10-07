"use client";

import { useMemo, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, CheckCircle2, Dumbbell, Flame, GraduationCap, Info, Wallet } from "lucide-react";
import { cn } from "cn";
import { GoalCard } from "@/components/shared/goal-card";
import { SectionTitle } from "@/components/shared/section-title";
import { Surface } from "@/components/shared/surface";
import { WeekDots } from "@/components/shared/week-dots";
import { TransactionSheet, type TxSheetState } from "@/components/finance/transaction-sheet";
import { ReadingSessionSheet } from "@/components/reading/reading-session-sheet";
import { StudyStartSheet } from "@/components/studies/study-start-sheet";
import { buildAttention, type AttentionItem, type AttentionTone } from "@/domain/attention";
import { formatBRL, formatBRLCompact } from "@/domain/money";
import { progressPercent } from "@/domain/progress";
import { isTimerRunning, secondsInPeriod, timerElapsedSeconds } from "@/domain/studies";
import {
  financeSummary,
  readingWeekSummary,
  studyWeekSummary,
  workoutSummary,
} from "@/domain/summary";
import { useData, useDisplayName, useDraft, useNow, useTimer, useToday } from "@/data";
import { hourFromInstant, monthOf } from "@/lib/dates";
import {
  capitalize,
  formatClock,
  formatDayLong,
  formatMinutes,
  formatMonthName,
  greetingFor,
  pluralize,
} from "@/lib/format";

const TONE_STYLE: Record<AttentionTone, { icon: typeof Info; box: string }> = {
  danger: { icon: AlertTriangle, box: "bg-danger-soft text-danger-ink" },
  warn: { icon: AlertTriangle, box: "bg-warning-soft text-warning-ink" },
  info: { icon: Info, box: "bg-accent text-accent-foreground" },
  success: { icon: CheckCircle2, box: "bg-success-soft text-success-ink" },
};

function HomeScreenContent() {
  const data = useData();
  const today = useToday();
  const name = useDisplayName();
  const draft = useDraft();
  const timer = useTimer();
  const router = useRouter();
  // Atualiza a cada minuto para a saudação acompanhar o horário.
  const now = useNow(60_000);

  const [txOpen, setTxOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const txState: TxSheetState = { mode: "create" };

  const month = monthOf(today);
  const finance = useMemo(() => financeSummary(data, month), [data, month]);
  const workout = useMemo(() => workoutSummary(data, today), [data, today]);
  const study = useMemo(() => studyWeekSummary(data, today), [data, today]);
  const reading = useMemo(() => readingWeekSummary(data, today), [data, today]);
  const attention = useMemo(() => buildAttention(data, today), [data, today]);

  const todayStudySeconds = secondsInPeriod(data.studySessions, { start: today, end: today });
  const savingsPercent = progressPercent(finance.resultCents, finance.savingsTarget);
  const studyPercent = progressPercent(study.seconds / 60, study.targetMinutes);
  const workoutPercent = progressPercent(workout.done, workout.target);
  const readingPercent = progressPercent(reading.pages, reading.target);

  const streaks = [
    { key: "workout", label: "treino", weeks: workout.streak.weeks },
    { key: "study", label: "estudo", weeks: study.streak.weeks },
    { key: "reading", label: "leitura", weeks: reading.streak.weeks },
  ].filter((s) => s.weeks > 0);

  const hour = hourFromInstant(now);

  return (
    <div className="space-y-6 px-4 pb-6">
      <div className="pt-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {greetingFor(hour)}, {name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{capitalize(formatDayLong(today))}</p>
      </div>

      {/* Metas */}
      <section className="space-y-3" aria-label="Metas">
        <GoalCard
          module="finance"
          title={`Finanças · ${formatMonthName(month).toLowerCase()}`}
          ringLabel={`Meta de economia: ${Math.round(finance.savingsRatio * 100)}% concluída`}
          ratio={finance.savingsRatio}
          percentText={savingsPercent !== null ? `${savingsPercent}%` : undefined}
          headline={
            <span className={cn(finance.resultCents < 0 && "text-danger-ink")}>
              {formatBRL(finance.resultCents)}
            </span>
          }
          detail={
            <>
              Resultado do mês
              {finance.savingsTarget ? ` · meta ${formatBRLCompact(finance.savingsTarget)}` : " · sem meta de economia"}
              <br />
              Receitas {formatBRLCompact(finance.incomeCents)} · Despesas {formatBRLCompact(finance.expenseCents)}
            </>
          }
        />

        <GoalCard
          module="workout"
          title="Treino · semana"
          ringLabel={`Treinos: ${workout.done} de ${workout.target ?? "sem meta"} nesta semana`}
          ratio={workout.ratio}
          percentText={workoutPercent !== null ? `${workoutPercent}%` : undefined}
          headline={
            workout.target
              ? `${workout.done} de ${workout.target} ${pluralize(workout.target, "treino", "treinos")}`
              : `${workout.done} ${pluralize(workout.done, "treino", "treinos")} · sem meta`
          }
          detail={<WeekDots dots={workout.dots} className="mt-1.5" />}
        />

        <GoalCard
          module="study"
          title="Estudos · semana"
          ringLabel={`Estudo: ${Math.round(study.ratio * 100)}% da meta semanal`}
          ratio={study.ratio}
          percentText={studyPercent !== null ? `${studyPercent}%` : undefined}
          headline={
            study.targetMinutes
              ? `${formatMinutes(study.seconds / 60)} de ${formatMinutes(study.targetMinutes)}`
              : `${formatMinutes(study.seconds / 60)} estudados · sem meta`
          }
          detail={
            timer ? (
              <ActiveTimerHint />
            ) : (
              `Hoje: ${todayStudySeconds > 0 ? formatMinutes(todayStudySeconds / 60) : "nada registrado"}`
            )
          }
        />

        <GoalCard
          module="reading"
          title="Leitura · semana"
          href="/estudos/leitura"
          ringLabel={`Leitura: ${Math.round(reading.ratio * 100)}% da meta semanal`}
          ratio={reading.ratio}
          percentText={readingPercent !== null ? `${readingPercent}%` : undefined}
          headline={
            reading.target
              ? `${reading.pages} de ${reading.target} páginas`
              : `${reading.pages} ${pluralize(reading.pages, "página", "páginas")} · sem meta`
          }
          detail={
            reading.book
              ? `${reading.book.title} · pág. ${reading.currentPage} de ${reading.totalPages}`
              : "Nenhum livro em andamento · escolher livro"
          }
        />
      </section>

      {/* Ações rápidas */}
      <section className="space-y-3" aria-label="Ações rápidas">
        <SectionTitle>Ações rápidas</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction module="finance" icon={Wallet} label="Gasto" onClick={() => setTxOpen(true)} />
          <QuickAction
            module="workout"
            icon={Dumbbell}
            label={draft ? "Continuar" : "Treinar"}
            href={draft ? "/treino/sessao" : "/treino"}
          />
          <QuickAction
            module="study"
            icon={GraduationCap}
            label={timer ? "Cronômetro" : "Estudar"}
            {...(timer ? { href: "/estudos" } : { onClick: () => setStudyOpen(true) })}
          />
          <QuickAction module="reading" icon={BookOpen} label="Ler" onClick={() => setReadOpen(true)} />
        </div>
        {draft ? (
          <Link
            href="/treino/sessao"
            data-module="workout"
            className="flex min-h-12 items-center gap-2 rounded-xl bg-m-soft px-4 text-sm font-medium text-m-ink"
          >
            <Dumbbell className="size-4" aria-hidden />
            Treino em andamento: {draft.nameSnapshot}
          </Link>
        ) : null}
      </section>

      {/* Atenção */}
      {attention.length > 0 ? (
        <section className="space-y-3" aria-label="Atenção desta semana">
          <SectionTitle hint="Calculado pelo ritmo e pelos limites, sem IA">Atenção desta semana</SectionTitle>
          <ul className="space-y-2">
            {attention.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Sequências */}
      {streaks.length > 0 ? (
        <section className="space-y-3" aria-label="Sequências semanais">
          <SectionTitle hint="Semanas seguidas batendo a meta">Sequências</SectionTitle>
          <Surface className="flex flex-wrap gap-2 p-3">
            {streaks.map((s) => (
              <span
                key={s.key}
                className="flex min-h-9 items-center gap-1.5 rounded-full bg-warning-soft px-3 text-sm font-medium text-warning-ink"
              >
                <Flame className="size-4" aria-hidden />
                {s.weeks} {pluralize(s.weeks, "semana", "semanas")} · {s.label}
              </span>
            ))}
          </Surface>
        </section>
      ) : null}

      <TransactionSheet open={txOpen} state={txState} onOpenChange={setTxOpen} />
      <ReadingSessionSheet open={readOpen} onOpenChange={setReadOpen} bookId={reading.book?.id ?? null} />
      <StudyStartSheet open={studyOpen} onOpenChange={setStudyOpen} onStarted={() => router.push("/estudos")} />
    </div>
  );
}

function ActiveTimerHint() {
  const timer = useTimer();
  const now = useNow(1000);
  if (!timer) return null;
  return (
    <span className="font-medium text-m-ink">
      {isTimerRunning(timer) ? "● Estudando" : "Ⅱ Pausado"} · {formatClock(timerElapsedSeconds(timer, now))}
    </span>
  );
}

interface QuickActionProps {
  module: string;
  icon: typeof Wallet;
  label: string;
  href?: string;
  onClick?: () => void;
}

function QuickAction({ module, icon: Icon, label, href, onClick }: QuickActionProps) {
  const className =
    "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-card p-2 text-sm font-medium ring-1 ring-border/70 transition active:scale-[0.97] active:bg-muted/60";
  const content = (
    <>
      <span className="grid size-10 place-items-center rounded-full bg-m-soft text-m-ink">
        <Icon className="size-5" aria-hidden />
      </span>
      {label}
    </>
  );
  return href ? (
    <Link href={href} data-module={module} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" data-module={module} onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const style = TONE_STYLE[item.tone];
  const Icon = style.icon;
  return (
    <li>
      <Link
        href={item.href}
        className={cn("flex min-h-12 items-start gap-3 rounded-xl p-3 text-sm font-medium", style.box)}
      >
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{item.text}</span>
      </Link>
    </li>
  );
}

export const HomeScreen = withStoreGate(HomeScreenContent);
