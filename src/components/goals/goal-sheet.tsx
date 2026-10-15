"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { DistanceField } from "@/components/shared/distance-field";
import { UnitField } from "@/components/shared/unit-field";
import { GOAL_PERIOD } from "@/domain/goals";
import { centsFromDigits, formatBRL } from "@/domain/money";
import { formatDistance, kmInputText, MAX_WEEKLY_GOAL_METERS, parseDistanceKm } from "@/domain/running";
import type { GoalKind } from "@/domain/types";
import { litersInputText, parseLiters } from "@/domain/water";
import { useActions, useToday } from "@/data";
import { addDays, addMonths, monthOf, monthStart, weekStart } from "@/lib/dates";
import { formatMinutes } from "@/lib/format";
import { notify } from "@/components/shared/notify";

export interface GoalTarget {
  kind: GoalKind;
  scopeId: string | null;
  /** nome exibido no título, ex.: "Treinos por semana" */
  title: string;
  /** meta vigente hoje (centavos, sessões, minutos, páginas, metros ou ml por dia) */
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
  running_meters: "km por semana",
  water_ml: "litros por dia",
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

  // A meta de corrida é guardada em METROS inteiros mas digitada em KM, com vírgula ou ponto ("12,5"): o campo é de
  // texto e passa por `parseDistanceKm`. Os demais (dinheiro, sessões, minutos, páginas) continuam só com dígitos.
  const isRunning = target.kind === "running_meters";
  const [kmText, setKmText] = useState(kmInputText(target.current ?? undefined));
  const km = parseDistanceKm(kmText);
  const runningMeters = km.ok ? km.meters : null;
  const runningError = !km.ok
    ? kmText.trim() !== ""
      ? km.error
      : null
    : runningMeters !== null && runningMeters > MAX_WEEKLY_GOAL_METERS
      ? `A meta semanal pode ir até ${formatDistance(MAX_WEEKLY_GOAL_METERS)}.`
      : null;

  // A meta de água é guardada em ML POR DIA, inteiros, mas digitada em LITROS ("2,5"): campo de texto validado por
  // `parseLiters`, pelo mesmo motivo da corrida (apagar a vírgula de "2,5" não pode virar 25).
  const isWater = target.kind === "water_ml";
  const [litersText, setLitersText] = useState(litersInputText(target.current ?? undefined));
  const liters = parseLiters(litersText);
  const waterMl = liters.ok ? liters.ml : null;
  const waterError = !liters.ok && litersText.trim() !== "" ? liters.error : null;

  const [numeric, setNumeric] = useState<number>(isRunning || isWater ? 0 : (target.current ?? 0));
  const value = isRunning ? (runningMeters ?? 0) : isWater ? (waterMl ?? 0) : numeric;
  const canSave = isRunning
    ? runningMeters !== null && runningMeters > 0 && runningError === null
    : isWater
      ? waterMl !== null && waterMl > 0 && waterError === null
      : numeric > 0;
  const [from, setFrom] = useState<"now" | "next">("now");

  const currentStart = monthly ? monthStart(monthOf(today)) : weekStart(today);
  const nextStart = monthly ? monthStart(addMonths(monthOf(today), 1)) : addDays(weekStart(today), 7);

  const [saving, setSaving] = useState(false);

  async function save(nextValue: number) {
    if (saving) return;
    setSaving(true);
    const result = await setGoal({
      kind: target.kind,
      scopeId: target.scopeId,
      validFrom: from === "now" ? currentStart : nextStart,
      target: nextValue,
    });
    setSaving(false);
    if (!notify(result, nextValue > 0 ? "Meta atualizada" : "Meta removida")) return;
    onDone();
  }

  return (
    <div className="space-y-5" data-module="primary">
      <div className="space-y-2">
        <label htmlFor="goal-value" className="text-sm font-medium">
          {isMoney ? "Valor da meta (por mês)" : `Meta (${UNIT[target.kind]})`}
        </label>
        {isWater ? (
          <>
            <UnitField
              id="goal-value"
              unit="L"
              value={litersText}
              onChange={setLitersText}
              invalid={waterError !== null}
              describedBy={waterError ? "goal-value-error" : "goal-value-hint"}
              placeholder="Ex.: 2,5"
            />
            {waterError ? (
              <p id="goal-value-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
                {waterError}
              </p>
            ) : (
              <p id="goal-value-hint" className="text-sm text-muted-foreground">
                Referência comum: 2 a 3 litros por dia. Siga a orientação do seu médico.
              </p>
            )}
          </>
        ) : isRunning ? (
          <>
            <DistanceField
              id="goal-value"
              value={kmText}
              onChange={setKmText}
              invalid={runningError !== null}
              describedBy={runningError ? "goal-value-error" : undefined}
              placeholder="Ex.: 20 ou 12,5"
            />
            {runningError ? (
              <p id="goal-value-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
                {runningError}
              </p>
            ) : null}
          </>
        ) : isMoney ? (
          <Input
            id="goal-value"
            inputMode="numeric"
            autoComplete="off"
            value={formatBRL(numeric)}
            onChange={(e) => setNumeric(centsFromDigits(e.target.value))}
            className="h-14 text-center text-2xl font-semibold tabular-nums"
          />
        ) : (
          <Input
            id="goal-value"
            inputMode="numeric"
            autoComplete="off"
            value={numeric === 0 ? "" : String(numeric)}
            placeholder="0"
            onChange={(e) => setNumeric(Number(e.target.value.replace(/\D/g, "")) || 0)}
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
        {isWater ? (
          <p className="text-sm text-muted-foreground">A meta é por dia e vale a partir da segunda-feira da semana escolhida.</p>
        ) : null}
      </div>

      <SheetFooter>
        <Button size="lg" disabled={!canSave || saving} onClick={() => save(value)}>
          Salvar meta
        </Button>
        {target.current ? (
          <Button variant="ghost" size="lg" disabled={saving} onClick={() => save(0)}>
            Remover meta
          </Button>
        ) : null}
      </SheetFooter>
    </div>
  );
}
