"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withStoreGate } from "@/components/layout/store-gate";
import { SubHeader } from "@/components/layout/sub-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Surface } from "@/components/shared/surface";
import { sortRunsDesc } from "@/domain/running";
import type { RunningSession } from "@/domain/types";
import { useData, useToday } from "@/data";
import { monthOf } from "@/lib/dates";
import { formatMonthLabel } from "@/lib/format";
import { RunRow } from "./run-row";
import { RunningSessionSheet } from "./run-sheet";

const PAGE_SIZE = 15;

function RunningHistoryContent() {
  const data = useData();
  const today = useToday();
  const runs = useMemo(() => sortRunsDesc(data.runningSessions), [data.runningSessions]);

  const [visible, setVisible] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<RunningSession | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function open(run: RunningSession) {
    setEditing(run);
    setSheetOpen(true);
  }

  const shown = runs.slice(0, visible);

  return (
    <div data-module="running" className="pb-8">
      <SubHeader title="Histórico de corridas" backHref="/treino/corrida" backLabel="Voltar para Corrida" />
      <div className="space-y-3 px-4 pt-2">
        {runs.length === 0 ? (
          <EmptyState
            icon={Footprints}
            title="Nenhuma corrida registrada"
            description="Quando você registrar uma corrida, ela aparece aqui."
            action={
              <Button asChild>
                <Link href="/treino/corrida">Registrar corrida</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Surface className="overflow-hidden">
              {shown.map((run, index) => {
                const month = monthOf(run.occurredOn);
                const startsMonth = index === 0 || monthOf(shown[index - 1].occurredOn) !== month;
                return (
                  <Fragment key={run.id}>
                    {startsMonth ? (
                      <h2 className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {formatMonthLabel(month)}
                      </h2>
                    ) : null}
                    <RunRow run={run} today={today} onOpen={open} className="border-b border-border/60 last:border-b-0" />
                  </Fragment>
                );
              })}
            </Surface>
            {visible < runs.length ? (
              <Button variant="ghost" className="w-full" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Mostrar mais
              </Button>
            ) : null}
          </>
        )}
      </div>
      <RunningSessionSheet open={sheetOpen} onOpenChange={setSheetOpen} session={editing} />
    </div>
  );
}

export const RunningHistoryScreen = withStoreGate(RunningHistoryContent);
