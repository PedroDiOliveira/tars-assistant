"use client";

import { useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/components/shared/notify";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import {
  durationParts,
  formatDistance,
  formatPace,
  FUTURE_RUN_ERROR,
  kmInputText,
  MAX_RUN_NOTES,
  paceSecondsPerKm,
  parseDistanceKm,
  parseDuration,
} from "@/domain/running";
import type { RunningSession } from "@/domain/types";
import { useActions, useToday } from "@/data";
import { addDays, isValidDateKey, type DateKey } from "@/lib/dates";
import { uid } from "@/lib/id";
import { DistanceField } from "@/components/shared/distance-field";

interface RunningSessionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** corrida existente para editar; sem ela, registra uma nova */
  session: RunningSession | null;
}

export function RunningSessionSheet({ open, onOpenChange, session }: RunningSessionSheetProps) {
  // Cada abertura do cadastro é um formulário NOVO (campos limpos e um id novo). Dentro da mesma abertura o id
  // não muda, nem depois de uma falha: é isso que faz a nova tentativa ser o mesmo registro. Padrão do React para
  // reagir a uma mudança de prop sem efeito: https://react.dev/learn/you-might-not-need-an-effect
  const [wasOpen, setWasOpen] = useState(open);
  const [generation, setGeneration] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setGeneration((g) => g + 1);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={session ? "Editar corrida" : "Registrar corrida"}
      description={
        session
          ? "Corrija qualquer campo ou apague o registro."
          : "Só a data é necessária. Distância e duração podem ficar para depois."
      }
      module="running"
    >
      <RunForm key={`${session?.id ?? "new"}-${generation}`} session={session} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

const chip = (active: boolean) =>
  cn(
    "min-h-11 rounded-full border px-4 text-sm font-medium transition",
    active ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
  );

function RunForm({ session, onDone }: { session: RunningSession | null; onDone: () => void }) {
  const today = useToday();
  const { addRunningSession, updateRunningSession, deleteRunningSession } = useActions();

  // O id nasce com o formulário e fica até o salvamento ser confirmado: toque duplo e nova tentativa depois de
  // uma resposta perdida reenviam o MESMO registro (o servidor ignora a repetição).
  const [newId] = useState(uid);

  const [date, setDate] = useState<DateKey>(session?.occurredOn ?? today);
  const [distanceText, setDistanceText] = useState(kmInputText(session?.distanceMeters));
  const [duration, setDuration] = useState(durationParts(session?.durationSeconds));
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [detailsOpen, setDetailsOpen] = useState(session?.durationSeconds !== undefined || Boolean(session?.notes));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = useRef(false);

  const distance = parseDistanceKm(distanceText);
  const parsedDuration = parseDuration(duration);
  // Mesma regra do reducer e do banco: só mover a data para o futuro é recusado (corrigir uma corrida existente não).
  const dateError = !isValidDateKey(date)
    ? "Escolha uma data válida."
    : date > today && date !== session?.occurredOn
      ? FUTURE_RUN_ERROR
      : null;
  const notesError = notes.length > MAX_RUN_NOTES ? `A observação aceita até ${MAX_RUN_NOTES} caracteres.` : null;
  const valid = distance.ok && parsedDuration.ok && !dateError && !notesError;

  // Um erro dentro dos detalhes nunca fica escondido: a área abre sozinha.
  const detailsVisible = detailsOpen || !parsedDuration.ok || notesError !== null;

  const pace =
    distance.ok && parsedDuration.ok ? paceSecondsPerKm(distance.meters ?? undefined, parsedDuration.seconds ?? undefined) : null;

  async function save() {
    if (busy.current || !valid || !distance.ok || !parsedDuration.ok) return;
    busy.current = true;
    setSaving(true);
    try {
      const fields = {
        occurredOn: date,
        ...(distance.meters !== null ? { distanceMeters: distance.meters } : {}),
        ...(parsedDuration.seconds !== null ? { durationSeconds: parsedDuration.seconds } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const result = session ? await updateRunningSession(session.id, fields) : await addRunningSession({ ...fields, id: newId });
      const message = session
        ? "Corrida atualizada"
        : distance.meters !== null
          ? `Corrida de ${formatDistance(distance.meters)} registrada`
          : "Corrida registrada";
      // Falhou: o formulário continua como está (e com o mesmo id) para tentar de novo.
      if (!notify(result, message)) return;
      onDone();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function remove() {
    if (!session || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      if (notify(await deleteRunningSession(session.id), "Corrida excluída")) onDone();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const distanceError = !distance.ok && distanceText.trim() !== "" ? distance.error : null;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="run-distance" className="flex items-baseline justify-between gap-2 text-sm font-medium">
          <span>Distância</span>
          <span className="font-normal text-muted-foreground">opcional</span>
        </label>
        <DistanceField
          id="run-distance"
          value={distanceText}
          onChange={setDistanceText}
          invalid={distanceError !== null}
          describedBy="run-distance-hint"
          placeholder="Ex.: 5,2"
        />
        <p id="run-distance-hint" className="text-sm text-muted-foreground">
          Pode deixar em branco e preencher depois. Aceita vírgula ou ponto (5,2 ou 5.2).
        </p>
        {distanceError ? (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
            {distanceError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Data</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Hoje", value: today },
            { label: "Ontem", value: addDays(today, -1) },
          ].map((o) => (
            <button key={o.label} type="button" aria-pressed={date === o.value} onClick={() => setDate(o.value)} className={chip(date === o.value)}>
              {o.label}
            </button>
          ))}
          <Input
            type="date"
            aria-label="Escolher outra data"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-auto min-w-40 flex-1 rounded-full"
          />
        </div>
        {dateError ? (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
            {dateError}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <button
          type="button"
          aria-expanded={detailsVisible}
          aria-controls="run-details"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-sm font-medium"
        >
          <span>
            Duração e observação <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", detailsVisible && "rotate-180")} aria-hidden />
        </button>
        <div id="run-details" hidden={!detailsVisible} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Duração</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["hours", "Horas", 2],
                  ["minutes", "Minutos", 2],
                  ["seconds", "Segundos", 2],
                ] as const
              ).map(([key, label, max]) => (
                <label key={key} className="space-y-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Input
                    inputMode="numeric"
                    placeholder="0"
                    maxLength={max}
                    value={duration[key]}
                    aria-invalid={!parsedDuration.ok ? true : undefined}
                    onChange={(e) => setDuration((d) => ({ ...d, [key]: e.target.value.replace(/\D/g, "") }))}
                    className="text-center tabular-nums"
                  />
                </label>
              ))}
            </div>
            {!parsedDuration.ok ? (
              <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
                {parsedDuration.error}
              </p>
            ) : pace !== null ? (
              <p className="text-sm text-muted-foreground tabular-nums">Ritmo médio: {formatPace(pace)}</p>
            ) : null}
          </fieldset>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Observação</span>
            <Input
              value={notes}
              maxLength={MAX_RUN_NOTES + 20}
              placeholder="Ex.: Parque, ritmo leve"
              aria-invalid={notesError ? true : undefined}
              onChange={(e) => setNotes(e.target.value)}
            />
            {notesError ? <span className="block text-sm text-danger-ink">{notesError}</span> : null}
          </label>
        </div>
      </div>

      <SheetFooter>
        <Button size="lg" disabled={!valid || saving} onClick={save}>
          {saving ? "Salvando…" : session ? "Salvar alterações" : "Registrar corrida"}
        </Button>
        {session ? (
          <Button variant="destructive" size="lg" disabled={saving} onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden /> Excluir corrida
          </Button>
        ) : null}
      </SheetFooter>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir esta corrida?"
        description="O histórico, os totais da semana e a meta serão recalculados."
        confirmLabel="Excluir"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
