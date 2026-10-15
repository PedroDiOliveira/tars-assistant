"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { notify } from "@/components/shared/notify";
import { hydrateWaterPrefs, useActions, useWaterPrefs, type PortionIndex } from "@/data";
import { formatLiters, formatTotal, formatWaterParts } from "@/domain/water";
import { clockFromInstant } from "@/lib/dates";
import { uid } from "@/lib/id";
import { DropShape, PORTION_ICONS, PORTION_NAMES } from "./icons";

/** Quanto tempo o "Desfazer" fica à mão depois de um toque. */
const UNDO_MS = 6000;

/** O último toque, para o "Desfazer". Tem o id que o servidor recebeu: desfazer é remover exatamente este registro. */
interface LastTap {
  id: string;
  ml: number;
  at: number;
}

interface TapContext {
  /** ml já bebidos hoje e a meta (só para o anúncio ao leitor de tela) */
  todayMl: number;
  targetMl: number | null;
}

/**
 * O contador: a porção escolhida, o toque que soma e o desfazer. É um hook (e não um componente único) porque a Início
 * e a tela de água montam as mesmas peças em lugares diferentes, mas compartilham o mesmo comportamento.
 *
 * Cada toque é um registro NOVO com id próprio (gerado aqui, no toque): o aviso de "Desfazer" aparece na hora, antes
 * do servidor responder, e as Server Actions saem em série, então o "remover" nunca passa na frente do "adicionar".
 * Sem sucesso em toast por toque (seria ruído a cada gole); só o erro avisa.
 */
export function useWaterTap({ todayMl, targetMl }: TapContext) {
  const { addWater, removeWater } = useActions();
  const portions = useWaterPrefs((s) => s.portions);
  const selected = useWaterPrefs((s) => s.selected);
  const select = useWaterPrefs((s) => s.select);

  const [last, setLast] = useState<LastTap | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pulse, setPulse] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // As preferências vêm do armazenamento do aparelho; até lá valem as de fábrica.
  useEffect(() => {
    void hydrateWaterPrefs();
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const ml = portions[selected];

  const total = useCallback(
    (extra: number) => {
      const sum = Math.max(0, todayMl + extra);
      return targetMl ? `${formatTotal(sum)} de ${formatLiters(targetMl)}` : formatTotal(sum);
    },
    [todayMl, targetMl],
  );

  async function tap() {
    const entry: LastTap = { id: uid(), ml, at: Date.now() };
    setLast(entry);
    setPulse((n) => n + 1);
    setAnnouncement(`Adicionado ${formatLiters(ml)}. Hoje: ${total(ml)}.`);
    try {
      navigator.vibrate?.(10);
    } catch {
      // sem vibração neste aparelho (iPhone): o anel e o total já respondem ao toque
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLast((current) => (current?.id === entry.id ? null : current)), UNDO_MS);

    const result = await addWater(entry);
    if (!result.ok) {
      // Nada foi salvo e o toque já saiu da tela. Um aviso só, mesmo que vários toques falhem em seguida.
      toast.error(result.error, { id: "water-error" });
      setLast((current) => (current?.id === entry.id ? null : current));
      setAnnouncement("O último toque não foi salvo.");
    }
  }

  async function undo() {
    if (!last) return;
    const removed = last;
    clearTimeout(timer.current);
    setLast(null);
    setAnnouncement(`Desfeito: ${formatLiters(removed.ml)} removidos. Hoje: ${total(-removed.ml)}.`);
    // Se falhar, o registro volta à tela (a camada de dados refaz o total) e o erro avisa.
    notify(await removeWater(removed.id));
  }

  return { portions, selected, select, ml, last, announcement, pulse, tap, undo };
}

export type WaterTap = ReturnType<typeof useWaterTap>;

/** Região que o leitor de tela anuncia: o que o toque fez e o total do dia. Invisível. */
export function WaterAnnouncer({ text }: { text: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {text}
    </p>
  );
}

/** A gota em destaque: um toque soma a porção escolhida. O rótulo mostra sempre QUANTO vai somar. */
export function WaterDropButton({ ml, pulse, onTap, className }: { ml: number; pulse: number; onTap: () => void; className?: string }) {
  const { value, unit } = formatWaterParts(ml);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Adicionar ${formatLiters(ml)} de água`}
      className={cn(
        "relative grid aspect-[64/76] w-[5.25rem] shrink-0 place-items-center text-m transition-transform active:scale-95",
        "rounded-[2.4rem] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {pulse > 0 ? <span key={pulse} aria-hidden className="water-ripple pointer-events-none absolute inset-2" /> : null}
      <DropShape className="absolute inset-0 size-full" />
      <span className="relative mt-5 flex flex-col items-center leading-none text-water-on">
        <span className="text-xl font-bold tabular-nums">+{value}</span>
        <span className="mt-0.5 text-xs font-semibold">{unit}</span>
      </span>
    </button>
  );
}

/** Copo, garrafa e garrafa grande. Escolher não soma nada: só define o que a gota vai somar. */
export function PortionPicker({
  portions,
  selected,
  onSelect,
  onEdit,
}: {
  portions: readonly number[];
  selected: PortionIndex;
  onSelect: (index: PortionIndex) => void;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <div role="radiogroup" aria-label="Quantidade por toque" className="grid flex-1 grid-cols-3 gap-2">
        {portions.map((portion, index) => {
          const Icon = PORTION_ICONS[index];
          const active = index === selected;
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${PORTION_NAMES[index]}, ${formatLiters(portion)}`}
              onClick={() => onSelect(index as PortionIndex)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-medium tabular-nums transition",
                "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-m-soft text-m-ink ring-2 ring-m" : "bg-muted/60 text-muted-foreground active:bg-muted",
              )}
            >
              <Icon className={index === 0 ? "size-6" : index === 1 ? "size-7" : "size-8"} />
              <span>{formatLiters(portion)}</span>
            </button>
          );
        })}
      </div>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar quantidades"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * "Desfazer +500 ml": o botão compacto do card da Início. Fica no cabeçalho, que nunca muda de altura: o aviso aparece
 * sem empurrar a gota (que mudaria de lugar debaixo do dedo) e sem ir parar atrás da barra de navegação.
 */
export function UndoPill({ last, onUndo }: { last: LastTap; onUndo: () => void }) {
  return (
    <button
      type="button"
      onClick={onUndo}
      className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-m-soft px-3.5 text-sm font-semibold text-m-ink tabular-nums transition active:opacity-70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Undo2 className="size-4" aria-hidden />
      Desfazer +{formatLiters(last.ml)}
    </button>
  );
}

/** "+500 ml às 14:32 · Desfazer": a versão larga (tela de água). Some sozinha depois de alguns segundos ou no próximo toque. */
export function UndoChip({ last, onUndo }: { last: LastTap | null; onUndo: () => void }) {
  if (!last) return null;
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-m-soft pl-3 text-sm text-m-ink">
      <span className="tabular-nums">
        +{formatLiters(last.ml)} às {clockFromInstant(last.at)}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="min-h-11 rounded-xl px-4 font-semibold underline underline-offset-2 transition active:bg-black/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Desfazer
      </button>
    </div>
  );
}
