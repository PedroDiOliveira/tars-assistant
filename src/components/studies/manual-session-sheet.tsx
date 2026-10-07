"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { HueDot } from "@/components/shared/hue-bubble";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import type { StudySession } from "@/domain/types";
import { useActions, useData, useToday } from "@/data";
import { addDays, isValidDateKey, type DateKey } from "@/lib/dates";
import { formatDurationSeconds } from "@/lib/format";
import { notify } from "@/components/shared/notify";
import { activeOnly } from "@/domain/catalog";
import { MAX_SESSION_SECONDS } from "@/domain/studies";

interface ManualSessionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** sessão existente para editar; sem ela, cria um registro manual */
  session: StudySession | null;
}

const QUICK_MINUTES = [25, 45, 60, 90];

export function ManualSessionSheet({ open, onOpenChange, session }: ManualSessionSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={session ? "Editar sessão de estudo" : "Registrar estudo manualmente"}
      description="Para quando esqueceu de ligar o cronômetro."
      module="study"
    >
      <ManualSessionForm
        key={session?.id ?? "new"}
        session={session}
        onDone={() => onOpenChange(false)}
      />
    </Sheet>
  );
}

function ManualSessionForm({ session, onDone }: { session: StudySession | null; onDone: () => void }) {
  const allSubjects = useData().subjects;
  const today = useToday();
  const { addStudySession, updateStudySession, deleteStudySession } = useActions();

  // matérias arquivadas saem da escolha, exceto a da sessão que está sendo editada
  const subjects = activeOnly(allSubjects, [session?.subjectId]);
  const [subjectId, setSubjectId] = useState<string>(session?.subjectId ?? subjects[0]?.id ?? "");
  const [date, setDate] = useState<DateKey>(session?.occurredOn ?? today);
  const initialMinutes = session ? Math.round(session.durationSeconds / 60) : 0;
  const [hours, setHours] = useState<string>(initialMinutes >= 60 ? String(Math.floor(initialMinutes / 60)) : "");
  const [minutes, setMinutes] = useState<string>(initialMinutes ? String(initialMinutes % 60) : "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const submitted = useRef(false);

  const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const tooLong = totalMinutes * 60 > MAX_SESSION_SECONDS;
  const valid = subjectId !== "" && totalMinutes > 0 && !tooLong && isValidDateKey(date);

  function setTotal(total: number) {
    setHours(total >= 60 ? String(Math.floor(total / 60)) : "");
    setMinutes(total % 60 ? String(total % 60) : "");
  }

  async function save() {
    if (submitted.current || !valid) return;
    submitted.current = true;
    const payload = {
      subjectId,
      occurredOn: date,
      durationSeconds: totalMinutes * 60,
      notes: notes.trim() || undefined,
    };
    const result = session
      ? await updateStudySession(session.id, payload)
      : await addStudySession(payload);
    const message = session
      ? "Sessão atualizada"
      : `${formatDurationSeconds(payload.durationSeconds)} de estudo registrados`;
    if (!notify(result, message)) {
      submitted.current = false;
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Matéria</p>
        <div role="radiogroup" aria-label="Matéria" className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === subjectId}
              onClick={() => setSubjectId(s.id)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition",
                s.id === subjectId ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
              )}
            >
              <HueDot hue={s.hue} />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Duração</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Horas</span>
            <Input inputMode="numeric" placeholder="0" value={hours} maxLength={2} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Minutos</span>
            <Input inputMode="numeric" placeholder="0" value={minutes} maxLength={2} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTotal(m)}
              className="min-h-11 rounded-full border bg-card px-3.5 text-sm font-medium transition active:bg-muted"
            >
              {m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m} min`}
            </button>
          ))}
        </div>
        {tooLong ? <p className="text-sm text-danger-ink">Máximo de 24 horas por sessão.</p> : null}
      </div>

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

      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Observação <span className="font-normal text-muted-foreground">(opcional)</span>
        </span>
        <Input value={notes} maxLength={120} placeholder="Ex.: Joins e subconsultas" onChange={(e) => setNotes(e.target.value)} />
      </label>

      <SheetFooter>
        <Button size="lg" disabled={!valid} onClick={save}>
          {session ? "Salvar alterações" : "Registrar estudo"}
        </Button>
        {session ? (
          <Button variant="destructive" size="lg" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden /> Excluir sessão
          </Button>
        ) : null}
      </SheetFooter>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir esta sessão de estudo?"
        description="Os totais da semana e da matéria serão recalculados."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          if (!session) return;
          if (notify(await deleteStudySession(session.id), "Sessão excluída")) onDone();
        }}
      />
    </div>
  );
}
