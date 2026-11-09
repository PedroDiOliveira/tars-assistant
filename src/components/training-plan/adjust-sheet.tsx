"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import {
  ADJUST_CHIPS,
  ADJUST_RULES_VERSION,
  MAX_ADJUST_TEXT,
  describeChange,
  focusAdjustment,
  ruleSuggestions,
  type AdjustChip,
  type SuggestedChange,
} from "@/domain/training-adjust";
import { PRINCIPLES } from "@/domain/training-evidence";
import { PRIORITY_GROUPS, PRIORITY_LABELS } from "@/domain/training-profile";
import type { PlanProposal } from "@/domain/training-proposal";
import type { PlanDay } from "@/domain/training-rules";
import type { Exercise, PriorityGroup, TrainingAdjustTrigger, TrainingProfile } from "@/domain/types";
import { trainingPlan } from "@/data";
import { ASSISTANT } from "@/lib/constants";
import { usePlanPanel } from "./plan-settings";

type Step =
  | { kind: "pick" }
  | { kind: "focus" }
  | { kind: "exercise" }
  | { kind: "thinking" }
  | {
      kind: "preview";
      changes: SuggestedChange[];
      message: string | null;
      meta: AdjustMeta;
    };

/** De onde veio o ajuste: vai para o histórico quando aplicado no plano em uso. */
export interface AdjustMeta {
  trigger: TrainingAdjustTrigger;
  source: "rules" | "ai";
  model?: string;
  promptVersion: string;
}

const OPTION =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition active:scale-[0.99] active:bg-m-soft";

/** Um cartão de antes → depois, que liga e desliga. */
function ChangeCard({
  proposal,
  suggestion,
  on,
  onToggle,
  nameOf,
  showReason,
}: {
  proposal: PlanProposal;
  suggestion: SuggestedChange;
  on: boolean;
  onToggle: () => void;
  nameOf: (key: string) => string;
  /** false quando todas as mudanças têm o mesmo motivo (ele aparece uma vez, acima) */
  showReason: boolean;
}) {
  const view = describeChange(proposal, suggestion.change, nameOf);
  if (!view) return null;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(OPTION, "items-start", on && "border-m bg-m-soft")}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">
          {view.where}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 font-medium">
          <span
            className={on ? "text-muted-foreground line-through" : undefined}
          >
            {view.before}
          </span>
          <ArrowRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-label="vira"
          />
          <span>{view.after}</span>
        </span>
        {showReason ? (
          <span className="mt-1 block text-sm text-muted-foreground">
            {suggestion.reason}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
          on && "border-transparent bg-primary text-primary-foreground",
        )}
        aria-hidden
      >
        {on ? <Check className="size-4" /> : null}
      </span>
    </button>
  );
}

/**
 * "Ajustar o plano": o que a pessoa não gostou, sem refazer o formulário. Os chips viram mudanças pelas regras (sem IA,
 * sem custo); só "Outra coisa" chama a IA. Tudo passa por uma prévia de antes → depois, e só o que ficar marcado é
 * aplicado (com "Desfazer" depois).
 */
export function AdjustSheet({
  open,
  onOpenChange,
  proposal,
  days,
  nameOf,
  onApply,
  onPickExercise,
  initial,
  showSplit = true,
  profile,
  exercises,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: PlanProposal;
  /** os treinos listados em "Não curti um exercício" (no rascunho, só o aberto na tela) */
  days: PlanDay[];
  nameOf: (key: string) => string;
  onApply: (changes: SuggestedChange[], meta: AdjustMeta) => void;
  onPickExercise: (slotId: string) => void;
  /** abrir direto na prévia (a sugestão do app); o componente é remontado (key) a cada sugestão */
  initial?: {
    changes: SuggestedChange[];
    trigger: TrainingAdjustTrigger;
    message?: string;
  };
  /** as respostas do plano (objetivo, experiência, limitações): o foco depende delas */
  profile: TrainingProfile | null;
  exercises: readonly Exercise[];
  /** "Mudar a divisão" só no rascunho; no plano em uso, mudar a divisão é gerar um plano novo */
  showSplit?: boolean;
}) {
  const [step, setStep] = useState<Step>(() =>
    initial
      ? {
          kind: "preview",
          changes: initial.changes,
          message: initial.message ?? null,
          meta: {
            trigger: initial.trigger,
            source: "rules",
            promptVersion: ADJUST_RULES_VERSION,
          },
        }
      : { kind: "pick" },
  );
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<ReadonlySet<number>>(new Set());
  const setPanel = usePlanPanel((s) => s.setPanel);

  function reset() {
    setStep({ kind: "pick" });
    setError(null);
    setOff(new Set());
  }

  function preview(
    changes: SuggestedChange[],
    meta: AdjustMeta,
    message: string | null = null,
  ) {
    setOff(new Set());
    setStep({ kind: "preview", changes, message, meta });
  }

  const rules = (trigger: TrainingAdjustTrigger): AdjustMeta => ({
    trigger,
    source: "rules",
    promptVersion: ADJUST_RULES_VERSION,
  });

  function fromChip(chip: AdjustChip) {
    if (chip === "foco") return setStep({ kind: "focus" });
    preview(ruleSuggestions(proposal, chip), rules(chip));
  }

  async function askAi() {
    const wanted = text.trim();
    if (!wanted) return;
    setError(null);
    setStep({ kind: "thinking" });
    const result = await trainingPlan.adjust(proposal, wanted);
    if (!result.ok) {
      setError(result.error);
      setStep({ kind: "pick" });
      return;
    }
    const { changes, message, model, promptVersion } = result.value;
    preview(
      changes,
      {
        trigger: "texto",
        source: "ai",
        ...(model ? { model } : {}),
        promptVersion,
      },
      message,
    );
  }

  const selected =
    step.kind === "preview" ? step.changes.filter((_, i) => !off.has(i)) : [];
  const principles = useMemo(
    () =>
      step.kind === "preview"
        ? [...new Set(step.changes.map((c) => c.principle))].map(
            (id) => PRINCIPLES[id],
          )
        : [],
    [step],
  );

  // Mesmo motivo em todos os cartões (os chips): uma frase só, acima, em vez de repetir em cada um.
  const reasons =
    step.kind === "preview"
      ? new Set(step.changes.map((c) => c.reason))
      : new Set<string>();
  const sharedReason =
    step.kind === "preview" && step.changes.length > 1 && reasons.size === 1
      ? step.changes[0].reason
      : null;

  const titles: Record<Step["kind"], string> = {
    pick: "O que você quer mudar?",
    focus: "Mais foco em qual grupo?",
    exercise: "Qual exercício você não curtiu?",
    thinking: "Pensando no ajuste…",
    preview: "Confira antes de aplicar",
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      module="workout"
      title={titles[step.kind]}
      description={
        step.kind === "pick"
          ? "Toque numa opção ou escreva com suas palavras. Nada muda antes de você conferir."
          : undefined
      }
    >
      {step.kind === "pick" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {ADJUST_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn(OPTION, "min-h-14 text-sm font-medium")}
                onClick={() => fromChip(chip.id)}
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              className={cn(OPTION, "min-h-14 text-sm font-medium")}
              onClick={() => setStep({ kind: "exercise" })}
            >
              Não curti um exercício
            </button>
            {showSplit ? (
              <button
                type="button"
                className={cn(
                  OPTION,
                  "col-span-2 min-h-12 text-sm font-medium",
                )}
                onClick={() => {
                  onOpenChange(false);
                  reset();
                  setPanel("split");
                }}
              >
                Mudar a divisão (A, B, C…)
              </button>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="adjust-text" className="text-sm font-medium">
              Outra coisa
            </label>
            <Textarea
              id="adjust-text"
              value={text}
              maxLength={MAX_ADJUST_TEXT}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: quero começar as pernas pelo leg press"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Não escreva informações médicas aqui. Dor ou lesão: refaça as
              perguntas do plano, na parte de saúde.
            </p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              variant="outline"
              className="w-full"
              disabled={!text.trim()}
              onClick={() => void askAi()}
            >
              <Sparkles aria-hidden /> Pedir {ASSISTANT.to}
            </Button>
          </div>
        </div>
      ) : null}

      {step.kind === "focus" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {PRIORITY_GROUPS.map((group: PriorityGroup) => (
              <button
                key={group}
                type="button"
                className={cn(OPTION, "font-medium")}
                onClick={() => {
                  if (!profile) return preview([], rules("foco"), "Responda às perguntas do plano para eu reforçar um grupo.");
                  const { changes, notes } = focusAdjustment(proposal, profile, exercises, group);
                  preview(changes, rules("foco"), notes.join(" ") || null);
                }}
              >
                {PRIORITY_LABELS[group]}
              </button>
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={reset}>
            <ChevronLeft aria-hidden /> Voltar
          </Button>
        </div>
      ) : null}

      {step.kind === "exercise" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Você vai ver as opções que trabalham o mesmo músculo.</p>
          {days.map((day) => (
            <div key={day.id} className="space-y-2">
              {days.length > 1 ? <p className="pt-1 text-sm font-semibold">{day.name}</p> : null}
              {day.slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className={cn(OPTION, "font-medium")}
                  onClick={() => {
                    onOpenChange(false);
                    reset();
                    onPickExercise(slot.id);
                  }}
                >
                  {nameOf(proposal.choices[slot.id].exerciseKey)}
                </button>
              ))}
            </div>
          ))}
          <Button variant="ghost" className="w-full" onClick={reset}>
            <ChevronLeft aria-hidden /> Voltar
          </Button>
        </div>
      ) : null}

      {step.kind === "thinking" ? (
        <p
          role="status"
          className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> {ASSISTANT.The} está olhando o seu plano…
        </p>
      ) : null}

      {step.kind === "preview" ? (
        <div className="space-y-3">
          {step.message ? <p className="text-sm">{step.message}</p> : null}
          {sharedReason ? (
            <p className="text-sm text-muted-foreground">{sharedReason}</p>
          ) : null}
          {step.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {step.meta.source === "rules"
                ? "Pelas regras, não há o que mudar aqui: já está no limite. Tente outra opção ou escreva o que quer."
                : "Nenhuma mudança cabe nas opções deste plano."}
            </p>
          ) : (
            <ul className="space-y-2">
              {step.changes.map((suggestion, i) => (
                <li key={i}>
                  <ChangeCard
                    proposal={proposal}
                    suggestion={suggestion}
                    on={!off.has(i)}
                    nameOf={nameOf}
                    showReason={!sharedReason}
                    onToggle={() =>
                      setOff((set) => {
                        const next = new Set(set);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {principles.length ? (
            <details className="group text-xs text-muted-foreground">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                Baseado em:{" "}
                {principles.map((p) => p.title.toLowerCase()).join(", ")} ·
                referências
                <ChevronDown
                  className="size-3.5 transition group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <ul className="mt-1 space-y-1">
                {principles.map((p) => (
                  <li key={p.id}>
                    {p.reference.short}.{" "}
                    <a
                      href={`https://doi.org/${p.reference.doi}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline underline-offset-2"
                    >
                      doi:{p.reference.doi}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <SheetFooter>
            {step.changes.length ? (
              <Button
                size="lg"
                className="w-full"
                disabled={selected.length === 0}
                onClick={() => {
                  onApply(selected, step.meta);
                  onOpenChange(false);
                  reset();
                }}
              >
                Aplicar {selected.length}{" "}
                {selected.length === 1 ? "mudança" : "mudanças"}
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="ghost"
              className="w-full"
              onClick={reset}
            >
              <ChevronLeft aria-hidden /> Voltar
            </Button>
          </SheetFooter>
        </div>
      ) : null}
    </Sheet>
  );
}
