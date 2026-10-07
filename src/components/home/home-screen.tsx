"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  GraduationCap,
  Info,
  Plus,
  Wallet,
} from "lucide-react";
import { cn } from "cn";
import { withStoreGate } from "@/components/layout/store-gate";
import { MetricRow } from "@/components/shared/metric-row";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { TransactionSheet, type TxSheetState } from "@/components/finance/transaction-sheet";
import { ReadingSessionSheet } from "@/components/reading/reading-session-sheet";
import { StudyStartSheet } from "@/components/studies/study-start-sheet";
import { buildAttention, type AttentionItem, type AttentionTone } from "@/domain/attention";
import { formatBRL, formatBRLCompact } from "@/domain/money";
import { isTimerRunning, timerElapsedSeconds } from "@/domain/studies";
import { financeSummary, readingWeekSummary, studyWeekSummary, workoutSummary } from "@/domain/summary";
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
  // Só o essencial: no máximo dois avisos na abertura.
  const attention = useMemo(() => buildAttention(data, today, 2), [data, today]);

  const negative = finance.resultCents < 0;
  const savingsMet = finance.savingsTarget !== null && finance.resultCents >= finance.savingsTarget;

  return (
    <div className="space-y-6 px-4">
      <div className="pt-1">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          {greetingFor(hourFromInstant(now))}, {name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{capitalize(formatDayLong(today))}</p>
      </div>

      {/* Destaque do mês */}
      <Link href="/financas" data-module="finance" className="block">
        <Surface className="p-5 transition active:bg-muted/40">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Resultado de {formatMonthName(month).toLowerCase()}
            </p>
            <ChevronRight className="size-4 text-muted-foreground/50" aria-hidden />
          </div>
          <p
            className={cn(
              "mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums",
              negative && "text-danger-ink",
            )}
          >
            {formatBRL(finance.resultCents)}
          </p>
          {finance.savingsTarget ? (
            <div className="mt-4 space-y-2">
              <ProgressBar
                className="h-1.5"
                ratio={finance.savingsRatio}
                tone={negative ? "over" : "ok"}
                label="Progresso da meta de economia"
              />
              <p className="text-sm text-muted-foreground">
                {savingsMet
                  ? `Meta de ${formatBRLCompact(finance.savingsTarget)} batida`
                  : `Faltam ${formatBRL(finance.savingsTarget - finance.resultCents)} para a meta`}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Toque para definir uma meta de economia</p>
          )}
        </Surface>
      </Link>

      {/* Ações rápidas */}
      <div className="grid grid-cols-4 gap-2">
        <QuickAction module="finance" icon={Plus} label="Gasto" onClick={() => setTxOpen(true)} />
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
        <QuickAction module="reading" icon={BookOpenText} label="Ler" onClick={() => setReadOpen(true)} />
      </div>

      {/* Em andamento (só aparece quando existe) */}
      {draft ? (
        <Link
          href="/treino/sessao"
          data-module="workout"
          className="flex min-h-12 items-center gap-2 rounded-2xl bg-m-soft px-4 text-sm font-medium text-m-ink"
        >
          <Dumbbell className="size-4" aria-hidden />
          Treino em andamento: {draft.nameSnapshot}
        </Link>
      ) : null}
      {timer ? <TimerBanner /> : null}

      {/* Metas da semana */}
      <section className="space-y-2">
        <h2 className="px-1 text-base font-semibold">Esta semana</h2>
        <Surface className="divide-y divide-border/60 overflow-hidden">
          <MetricRow
            href="/treino"
            module="workout"
            icon={Dumbbell}
            label="Treino"
            value={workout.target ? `${workout.done} de ${workout.target}` : String(workout.done)}
            unit={workout.target ? undefined : pluralize(workout.done, "treino", "treinos")}
            ratio={workout.ratio}
            progressLabel={`Treinos: ${workout.done} de ${workout.target ?? "sem meta"} nesta semana`}
          />
          <MetricRow
            href="/estudos"
            module="study"
            icon={GraduationCap}
            label="Estudo"
            value={formatMinutes(study.seconds / 60)}
            unit={study.targetMinutes ? `de ${formatMinutes(study.targetMinutes)}` : undefined}
            ratio={study.ratio}
            progressLabel="Progresso da meta semanal de estudo"
          />
          <MetricRow
            href="/estudos/leitura"
            module="reading"
            icon={BookOpenText}
            label="Leitura"
            value={reading.target ? `${reading.pages} de ${reading.target}` : String(reading.pages)}
            unit="páginas"
            ratio={reading.ratio}
            progressLabel="Progresso da meta semanal de leitura"
          />
        </Surface>
      </section>

      {/* Atenção */}
      {attention.length > 0 ? (
        <ul className="space-y-2">
          {attention.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </ul>
      ) : null}

      <TransactionSheet open={txOpen} state={txState} onOpenChange={setTxOpen} />
      <ReadingSessionSheet open={readOpen} onOpenChange={setReadOpen} bookId={reading.book?.id ?? null} />
      <StudyStartSheet open={studyOpen} onOpenChange={setStudyOpen} onStarted={() => router.push("/estudos")} />
    </div>
  );
}

function TimerBanner() {
  const timer = useTimer();
  const { subjects } = useData();
  const now = useNow(1000);
  if (!timer) return null;
  const subject = subjects.find((s) => s.id === timer.subjectId);
  return (
    <Link
      href="/estudos"
      data-module="study"
      className="flex min-h-12 items-center gap-2 rounded-2xl bg-m-soft px-4 text-sm font-medium text-m-ink"
    >
      <span className={cn("size-2 rounded-full bg-m", isTimerRunning(timer) && "animate-pulse")} aria-hidden />
      {isTimerRunning(timer) ? "Estudando" : "Pausado"} · {subject?.name}
      <span className="ml-auto tabular-nums">{formatClock(timerElapsedSeconds(timer, now))}</span>
    </Link>
  );
}

interface QuickActionProps {
  module: string;
  icon: typeof Wallet;
  label: string;
  href?: string;
  onClick?: () => void;
}

/** Ação rápida: ícone circular com rótulo embaixo. */
function QuickAction({ module, icon: Icon, label, href, onClick }: QuickActionProps) {
  const className = "flex flex-col items-center gap-2 text-center";
  const content = (
    <>
      <span className="grid size-14 place-items-center rounded-full bg-m-soft text-m-ink">
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="text-xs font-medium">{label}</span>
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
        className={cn("flex min-h-12 items-start gap-2.5 rounded-2xl p-3.5 text-sm font-medium", style.box)}
      >
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{item.text}</span>
      </Link>
    </li>
  );
}

export const HomeScreen = withStoreGate(HomeScreenContent);
