"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Square, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Surface } from "@/components/shared/surface";
import { isTimerRunning, timerElapsedSeconds } from "@/domain/studies";
import { useActions, useData, useNow, useTimer } from "@/data";
import { formatClock, formatDurationSeconds } from "@/lib/format";
import { SubjectStarter } from "./subject-starter";

/** Cronômetro de estudo: sem sessão ativa mostra as matérias; com sessão, o relógio e os controles. */
export function TimerCard() {
  const timer = useTimer();
  return (
    <Surface className="p-4" data-module="study">
      {timer ? <ActiveTimer /> : <IdleTimer />}
    </Surface>
  );
}

function IdleTimer() {
  const { startStudy } = useActions();
  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold">Estudar agora</p>
        <p className="text-sm text-muted-foreground">Toque numa matéria para iniciar o cronômetro.</p>
      </div>
      <SubjectStarter onStart={startStudy} armDelayMs={700} />
    </div>
  );
}

function ActiveTimer() {
  const timer = useTimer();
  const { subjects } = useData();
  const { pauseStudy, resumeStudy, finishStudy, discardStudy } = useActions();
  const now = useNow(1000);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!timer) return null;
  const subject = subjects.find((s) => s.id === timer.subjectId);
  const running = isTimerRunning(timer);
  const elapsed = timerElapsedSeconds(timer, now);

  function finish() {
    if (!timer) return;
    const seconds = timerElapsedSeconds(timer, Date.now());
    const result = finishStudy();
    if (result === "saved") {
      toast.success(`Sessão de ${formatDurationSeconds(seconds)} registrada em ${subject?.name ?? "estudo"}`);
    } else if (result === "too_short") {
      toast.info("Sessão com menos de 1 minuto: não foi registrada.");
    }
  }

  return (
    <div className="space-y-4 text-center">
      <div className="flex items-center justify-center gap-2 text-sm font-medium">
        <span
          aria-hidden
          className={cn("size-2.5 rounded-full", running ? "animate-pulse bg-m" : "bg-muted-foreground/50")}
        />
        <span className="text-muted-foreground">{running ? "Estudando" : "Pausado"}</span>
        <span className="rounded-full bg-m-soft px-2.5 py-0.5 text-m-ink">{subject?.name ?? "Matéria"}</span>
      </div>

      <p
        role="timer"
        aria-live="off"
        className="text-6xl font-bold tracking-tight tabular-nums"
      >
        {formatClock(elapsed)}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant="secondary"
          onClick={running ? pauseStudy : resumeStudy}
        >
          {running ? <Pause aria-hidden /> : <Play aria-hidden />}
          {running ? "Pausar" : "Retomar"}
        </Button>
        <Button size="lg" onClick={finish}>
          <Square aria-hidden /> Finalizar
        </Button>
      </div>
      <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmDiscard(true)}>
        <Trash2 aria-hidden /> Descartar sessão
      </Button>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Descartar esta sessão?"
        description="O tempo contado até agora não será registrado."
        confirmLabel="Descartar"
        destructive
        onConfirm={() => {
          discardStudy();
          toast.info("Sessão descartada");
        }}
      />
    </div>
  );
}
