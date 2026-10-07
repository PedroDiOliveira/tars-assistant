"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { GOAL_PERIOD } from "@/domain/goals";
import { centsFromDigits, formatBRL } from "@/domain/money";
import type { GoalKind } from "@/domain/types";
import { useActions, useToday } from "@/data";
import { addDays, addMonths, monthOf, monthStart, weekStart } from "@/lib/dates";
import { formatMinutes } from "@/lib/format";
import { notify } from "@/components/shared/notify";

export interface GoalTarget {
  kind: GoalKind;
  scopeId: string | null;
  /** nome exibido no título, ex.: "Treinos por semana" */
  title: string;
  /** meta vigente hoje (centavos, sessões, minutos ou páginas) */
  current: number | null;
}

interface GoalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: GoalTarget | null;
}

const UNIT: Record<GoalKind, string> = {
  savings: "",
  category_budget: "",
  workout_sessions: "treinos por semana",
  study_minutes: "minutos por semana",
  reading_pages: "páginas por semana",
};

export function GoalSheet({ open, onOpenChange, target }: GoalSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={target?.title ?? "Meta"}
      description="Defina o valor da meta. Períodos anteriores continuam com a meta que valia na época."
    >
      {target ? <GoalForm key={`${target.kind}-${target.scopeId}`} target={target} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function GoalForm({ target, onDone }: { target: GoalTarget; onDone: () => void }) {
  const today = useToday();
  const { setGoal } = useActions();
  const isMoney = target.kind === "savings" || target.kind === "category_budget";
  const monthly = GOAL_PERIOD[target.kind] === "month";

  const [value, setValue] = useState<number>(target.current ?? 0);
  const [from, setFrom] = useState<"now" | "next">("now");

  const currentStart = monthly ? monthStart(monthOf(today)) : weekStart(today);
  const nextStart = monthly ? monthStart(addMonths(monthOf(today), 1)) : addDays(weekStart(today), 7);

  async function save(nextValue: number) {
    const result = await setGoal({
      kind: target.kind,
      scopeId: target.scopeId,
      validFrom: from === "now" ? currentStart : nextStart,
      target: nextValue,
    });
    if (!notify(result, nextValue > 0 ? "Meta atualizada" : "Meta removida")) return;
    onDone();
  }

  return (
    <div className="space-y-5" data-module="primary">
      <div className="space-y-2">
        <label htmlFor="goal-value" className="text-sm font-medium">
          {isMoney ? "Valor da meta (por mês)" : `Meta (${UNIT[target.kind]})`}
        </label>
        {isMoney ? (
          <Input
            id="goal-value"
            inputMode="numeric"
            autoComplete="off"
            value={formatBRL(value)}
            onChange={(e) => setValue(centsFromDigits(e.target.value))}
            className="h-14 text-center text-2xl font-semibold tabular-nums"
          />
        ) : (
          <Input
            id="goal-value"
            inputMode="numeric"
            autoComplete="off"
            value={value === 0 ? "" : String(value)}
            placeholder="0"
            onChange={(e) => setValue(Number(e.target.value.replace(/\D/g, "")) || 0)}
            className="h-14 text-center text-2xl font-semibold tabular-nums"
          />
        )}
        {target.kind === "study_minutes" && value > 0 ? (
          <p className="text-center text-sm text-muted-foreground">= {formatMinutes(value)} por semana</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Vale a partir de</p>
        <Segmented
          ariaLabel="Vigência da meta"
          value={from}
          onChange={setFrom}
          options={[
            { value: "now", label: monthly ? "Este mês" : "Esta semana" },
            { value: "next", label: monthly ? "Próximo mês" : "Próxima semana" },
          ]}
        />
      </div>

      <SheetFooter>
        <Button size="lg" disabled={value <= 0} onClick={() => save(value)}>
          Salvar meta
        </Button>
        {target.current ? (
          <Button variant="ghost" size="lg" onClick={() => save(0)}>
            Remover meta
          </Button>
        ) : null}
      </SheetFooter>
    </div>
  );
}
