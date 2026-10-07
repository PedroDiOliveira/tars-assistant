"use client";

import { useMemo, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import Link from "next/link";
import { ChevronDown, Dumbbell, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Surface } from "@/components/shared/surface";
import { SubHeader } from "@/components/layout/sub-header";
import { sessionDurationMinutes, sessionSetCount, sessionVolume, sortSessionsDesc } from "@/domain/workouts";
import { useActions, useData, useToday } from "@/data";
import { formatDayRelative, formatMinutes } from "@/lib/format";
import { formatVolume, summarizeSets } from "./format-sets";
import { notify } from "@/components/shared/notify";

function HistoryScreenContent() {
  const data = useData();
  const today = useToday();
  const { deleteWorkoutSession } = useActions();
  const sessions = useMemo(() => sortSessionsDesc(data.sessions), [data.sessions]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  return (
    <div data-module="workout" className="pb-8">
      <SubHeader title="Histórico de treinos" backHref="/treino" />
      <div className="space-y-3 px-4 pt-2">
        {sessions.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="Nenhum treino concluído"
            description="Quando você finalizar um treino, ele aparece aqui."
            action={
              <Button asChild>
                <Link href="/treino">Escolher treino</Link>
              </Button>
            }
          />
        ) : (
          sessions.map((s) => {
            const open = openId === s.id;
            return (
              <Surface key={s.id} className="overflow-hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.nameSnapshot}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDayRelative(s.occurredOn, today)} · {sessionSetCount(s)} séries ·{" "}
                      {formatMinutes(sessionDurationMinutes(s))} · volume {formatVolume(sessionVolume(s))}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {open ? (
                  <div className="space-y-3 border-t px-4 py-3">
                    <ul className="space-y-2">
                      {s.exercises.map((e) => (
                        <li key={e.exerciseId} className="text-sm">
                          <p className="font-medium">{e.nameSnapshot}</p>
                          <p className="text-muted-foreground tabular-nums">{summarizeSets(e.sets)}</p>
                        </li>
                      ))}
                    </ul>
                    {s.notes ? <p className="rounded-lg bg-muted p-2.5 text-sm">{s.notes}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      Volume = soma de carga × repetições das séries concluídas com carga externa.
                    </p>
                    <Button variant="destructive" onClick={() => setToDelete(s.id)}>
                      <Trash2 aria-hidden /> Excluir treino
                    </Button>
                  </div>
                ) : null}
              </Surface>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir este treino?"
        description="A meta da semana e os recordes serão recalculados."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          const id = toDelete;
          setToDelete(null);
          setOpenId(null);
          if (id) notify(await deleteWorkoutSession(id), "Treino excluído");
        }}
      />
    </div>
  );
}

export const HistoryScreen = withStoreGate(HistoryScreenContent);
