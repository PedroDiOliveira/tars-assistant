"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { useWaterPrefs } from "@/data";
import { DEFAULT_WATER_PORTIONS, formatLiters, parseWaterMl, portionsError } from "@/domain/water";
import { PORTION_ICONS, PORTION_NAMES } from "./icons";

interface WaterPortionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edita copo, garrafa e garrafa grande. Vale só neste aparelho (as preferências não vão ao servidor). */
export function WaterPortionsSheet({ open, onOpenChange }: WaterPortionsSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Quantidades do contador"
      description="Quanto cada um soma quando você toca na gota. Vale só neste aparelho."
      module="water"
    >
      {open ? <PortionsForm onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function PortionsForm({ onDone }: { onDone: () => void }) {
  const portions = useWaterPrefs((s) => s.portions);
  const setPortions = useWaterPrefs((s) => s.setPortions);
  const [texts, setTexts] = useState<string[]>(() => portions.map(String));

  // Mesma regra do que é guardado: cada quantidade em ml inteiros e as três em ordem crescente.
  const parsed = texts.map(parseWaterMl);
  const fieldErrors = parsed.map((p) => (!p.ok && p.error !== "Informe a quantidade em ml." ? p.error : null));
  const values = parsed.map((p) => (p.ok ? p.ml : NaN));
  const allFilled = parsed.every((p) => p.ok);
  const orderError = allFilled ? portionsError(values) : null;
  const canSave = allFilled && orderError === null;
  const isDefault = texts.every((t, i) => t === String(DEFAULT_WATER_PORTIONS[i]));

  function save() {
    if (!canSave) return;
    const error = setPortions(values);
    if (error === null) onDone();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      {texts.map((text, index) => {
        const Icon = PORTION_ICONS[index];
        const id = `water-portion-${index}`;
        const error = fieldErrors[index];
        return (
          <div key={id} className="space-y-1.5">
            <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
              <Icon className="size-5 text-m-ink" />
              {PORTION_NAMES[index]}
            </label>
            <div className="relative">
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint={index === 2 ? "done" : "next"}
                maxLength={5}
                value={text}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => setTexts((current) => current.map((t, i) => (i === index ? e.target.value : t)))}
                className="h-12 pr-12 text-right text-lg font-semibold tabular-nums"
              />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-base text-muted-foreground">
                ml
              </span>
            </div>
            {error ? (
              <p id={`${id}-error`} role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      {orderError ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
          {orderError}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Em ordem crescente, de 1 ml a {formatLiters(5000)} cada. Padrão: {DEFAULT_WATER_PORTIONS.map(formatLiters).join(" · ")}.
        </p>
      )}

      <SheetFooter>
        <Button type="submit" size="lg" disabled={!canSave}>
          Salvar quantidades
        </Button>
        <Button type="button" variant="ghost" size="lg" disabled={isDefault} onClick={() => setTexts(DEFAULT_WATER_PORTIONS.map(String))}>
          Restaurar o padrão
        </Button>
      </SheetFooter>
    </form>
  );
}
