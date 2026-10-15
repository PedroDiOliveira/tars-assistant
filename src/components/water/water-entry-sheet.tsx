"use client";

import { useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/shared/notify";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { useActions, useNow, useToday } from "@/data";
import { formatLiters, parseWaterMl, waterIntakeError } from "@/domain/water";
import { addDays, clockFromInstant, instantFromLocal } from "@/lib/dates";
import { uid } from "@/lib/id";

interface WaterEntrySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Registro avulso: uma quantidade que não é uma das três porções, ou um gole que ficou sem registrar (hoje ou ontem). */
export function WaterEntrySheet({ open, onOpenChange }: WaterEntrySheetProps) {
  // Cada abertura é um formulário NOVO (campos limpos e um id novo). Dentro da mesma abertura o id não muda, nem depois
  // de uma falha: é isso que faz a nova tentativa ser o mesmo registro (padrão do registro de corrida).
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
      title="Adicionar outra quantidade"
      description="Registre uma quantidade diferente das porções, de hoje ou de ontem."
      module="water"
    >
      <EntryForm key={generation} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

const chip = (active: boolean) =>
  cn(
    "min-h-11 rounded-full border px-4 text-sm font-medium transition",
    active ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
  );

function EntryForm({ onDone }: { onDone: () => void }) {
  const today = useToday();
  const now = useNow(15_000);
  const { addWater } = useActions();
  const [id] = useState(uid);
  const [mlText, setMlText] = useState("");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  // Horário "agora" na abertura; a pessoa corrige se foi mais cedo.
  const [time, setTime] = useState(() => clockFromInstant(Date.now()));
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const dayKey = day === "today" ? today : addDays(today, -1);
  const parsed = parseWaterMl(mlText);
  const [hour, minute] = time.split(":").map(Number);
  const at = instantFromLocal(dayKey, hour, minute);
  // Mesma regra do servidor: até 5 min no futuro, só hoje e ontem.
  const timeError = at === null ? "Escolha um horário válido." : waterIntakeError({ at, ml: parsed.ok ? parsed.ml : 1 }, now);
  const mlError = !parsed.ok && mlText.trim() !== "" ? parsed.error : null;
  const valid = parsed.ok && at !== null && timeError === null;

  async function save() {
    if (busy.current || !parsed.ok || at === null || timeError) return;
    busy.current = true;
    setSaving(true);
    try {
      const result = await addWater({ id, ml: parsed.ml, at });
      // Falhou: o formulário continua como está (e com o mesmo id) para tentar de novo.
      if (!notify(result, `${formatLiters(parsed.ml)} registrados`)) return;
      onDone();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-5"
    >
      <div className="space-y-2">
        <label htmlFor="water-entry-ml" className="text-sm font-medium">
          Quantidade
        </label>
        <div className="relative">
          <Input
            id="water-entry-ml"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={5}
            autoFocus
            value={mlText}
            placeholder="Ex.: 250"
            aria-invalid={mlError ? true : undefined}
            aria-describedby={mlError ? "water-entry-ml-error" : undefined}
            onChange={(e) => setMlText(e.target.value)}
            className="h-14 pr-14 text-right text-2xl font-semibold tabular-nums"
          />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-lg font-medium text-muted-foreground">
            ml
          </span>
        </div>
        {mlError ? (
          <p id="water-entry-ml-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
            {mlError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quando</p>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Hoje"],
              ["yesterday", "Ontem"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={day === value} onClick={() => setDay(value)} className={chip(day === value)}>
              {label}
            </button>
          ))}
          <Input
            type="time"
            aria-label="Horário"
            value={time}
            onChange={(e) => e.target.value && setTime(e.target.value)}
            className="w-auto min-w-32 flex-1 rounded-full tabular-nums"
          />
        </div>
        {timeError && parsed.ok ? (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
            {timeError}
          </p>
        ) : null}
      </div>

      <SheetFooter>
        <Button type="submit" size="lg" disabled={!valid || saving}>
          Registrar
        </Button>
      </SheetFooter>
    </form>
  );
}
