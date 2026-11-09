"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, History, Sparkles } from "lucide-react";
import { AssistantAvatar } from "@/components/brand/assistant-avatar";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/shared/notify";
import { Surface } from "@/components/shared/surface";
import { describeChange, type SuggestedChange } from "@/domain/training-adjust";
import { currentPlanView, planChanges, stalledSuggestion } from "@/domain/training-current";
import { PRINCIPLES, type PrincipleId } from "@/domain/training-evidence";
import { SPLIT_LABELS } from "@/domain/training-profile";
import { formatRange } from "@/domain/training-rules";
import { splitOption } from "@/domain/training-splits";
import type { TrainingPlanChange, TrainingPlanRecord } from "@/domain/types";
import { isSuggestionSnoozed, snoozeSuggestion, useActions, useData, useNow, useToday } from "@/data";
import { dateKeyFromInstant } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { uid } from "@/lib/id";
import { ASSISTANT } from "@/lib/constants";
import { AdjustSheet, type AdjustMeta } from "./adjust-sheet";
import { AssistantNote } from "./assistant-note";
import { VolumeSection } from "./volume-section";
import { generateProposal } from "./generate";
import { SwapSheet, exerciseName } from "./proposal-review";

const TRIGGER_LABELS: Record<TrainingPlanChange["trigger"], string> = {
  "mais-curto": "Treino mais curto",
  "menos-exercicios": "Menos exercícios",
  foco: "Mais foco em um grupo",
  "mais-pesado": "Estava leve demais",
  "mais-leve": "Estava pesado demais",
  texto: `Pedido seu ${ASSISTANT.to} (IA)`,
  troca: "Troca sua",
  sugestao: `Sugestão ${ASSISTANT.of}`,
};

/** "O que mudou": os ajustes deste plano, do mais novo para o mais antigo (os 5 últimos; o resto atrás de um toque). */
function ChangesHistory({ changes }: { changes: TrainingPlanChange[] }) {
  const [all, setAll] = useState(false);
  if (changes.length === 0) return null;
  const shown = all ? changes : changes.slice(0, 5);
  return (
    <section aria-labelledby="changes-title" className="space-y-2">
      <h3 id="changes-title" className="flex items-center gap-2 px-1 font-semibold">
        <History className="size-4 text-m-ink" aria-hidden /> O que mudou
      </h3>
      <Surface className="divide-y divide-border/60 overflow-hidden">
        {shown.map((change) => (
          <div key={change.id} className="space-y-1.5 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {formatDayMonth(dateKeyFromInstant(change.createdAt))} · {TRIGGER_LABELS[change.trigger]}
            </p>
            <ul className="space-y-1.5">
              {change.items.map((item, i) => (
                <li key={i} className="text-sm">
                  <span className="text-muted-foreground">{item.where}: </span>
                  <span className="font-medium">
                    {item.before} <ArrowRight className="inline size-3.5 align-[-2px] text-muted-foreground" aria-label="virou" /> {item.after}
                  </span>
                  <span className="block text-muted-foreground">{item.reason}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Base: {[...new Set(change.items.map((i) => i.principle))].map((id) => PRINCIPLES[id as PrincipleId]?.title.toLowerCase() ?? id).join(", ")}
            </p>
          </div>
        ))}
      </Surface>
      {!all && changes.length > shown.length ? (
        <Button variant="ghost" className="w-full" onClick={() => setAll(true)}>
          Ver os {changes.length} ajustes
        </Button>
      ) : null}
    </section>
  );
}

/**
 * O plano aceito, como as fichas estão HOJE (com os ajustes e o que a pessoa mudou à mão), mais: ajustar sem refazer
 * nada, uma sugestão quando um exercício estagna e o histórico do que mudou e por quê. Ajustes aqui gravam nas fichas
 * (não têm "Desfazer"): por isso sempre passam pela prévia de antes → depois.
 */
export function CurrentPlan({ record }: { record: TrainingPlanRecord }) {
  const data = useData();
  const today = useToday();
  const { adjustTrainingPlan } = useActions();
  const [viewId] = useState(() => uid());
  const view = useMemo(() => currentPlanView(record, data, viewId), [record, data, viewId]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  const [suggestionOpen, setSuggestionOpen] = useState(0);
  const [snoozed, setSnoozed] = useState(0);
  const history = useMemo(() => planChanges(data.trainingPlanChanges, record.id), [data.trainingPlanChanges, record.id]);
  const keyName = (key: string) => exerciseName(data.exercises, key);
  const exerciseNameById = (id: string) => data.exercises.find((e) => e.id === id)?.name ?? "Exercício";

  const now = useNow(60_000);
  const suggestion = useMemo(
    () => (view ? stalledSuggestion(view, data, today, (id) => isSuggestionSnoozed(id, now)) : null),
    // `snoozed` muda ao tocar em "Agora não": recalcula sem a sugestão escondida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, data, today, now, snoozed],
  );
  const suggestionView = suggestion && view ? describeChange(view.proposal, suggestion.change, keyName) : null;

  async function apply(changes: SuggestedChange[], meta: AdjustMeta) {
    if (!view) return;
    const result = await adjustTrainingPlan({ view, changes, ...meta, nameOf: keyName });
    notify(result, changes.length === 1 ? "Ficha atualizada. Está em “O que mudou”." : "Fichas atualizadas. Está em “O que mudou”.");
  }

  const reasonFor = (exerciseId: string) => record.days.flatMap((d) => d.exercises).find((e) => e.exerciseId === exerciseId);
  const option = splitOption(record.option);

  return (
    <div className="space-y-5">
      <div className="space-y-1 px-1">
        <p className="text-sm font-medium text-muted-foreground">
          Plano atual · desde {formatDayMonth(dateKeyFromInstant(record.acceptedAt))} · {record.source === "ai" ? "montado com IA" : "modelo pronto"}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{option?.title ?? SPLIT_LABELS[record.split]}</h2>
      </div>

      {suggestion && suggestionView ? (
        <Surface className="space-y-3 p-4" role="region" aria-label={`Sugestão ${ASSISTANT.of}`}>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AssistantAvatar size="sm" /> {ASSISTANT.The} notou uma coisa no seu {suggestionView.where}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">{suggestionView.before}</span> <ArrowRight className="inline size-3.5 align-[-2px]" aria-label="por" />{" "}
            <span className="font-medium">{suggestionView.after}</span>
          </p>
          <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setSuggestionOpen((n) => n + 1)}>
              Ver e aplicar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                snoozeSuggestion(suggestion.exerciseId, now);
                setSnoozed((n) => n + 1);
              }}
            >
              Agora não
            </Button>
          </div>
        </Surface>
      ) : null}

      <AssistantNote source={record.source}>{record.summary}</AssistantNote>

      {record.days.map((day) => {
        const plan = data.plans.find((p) => p.id === day.planId);
        if (!plan || plan.archived) return null;
        return (
          <section key={day.planId} aria-label={plan.name} className="space-y-2">
            <h3 className="px-1 font-semibold">{plan.name}</h3>
            <Surface className="overflow-hidden">
              <ul className="divide-y divide-border/60">
                {plan.exercises.map((e, i) => {
                  const original = reasonFor(e.exerciseId);
                  return (
                    <li key={`${e.exerciseId}-${i}`} className="px-4 py-3">
                      <p className="font-medium">{exerciseNameById(e.exerciseId)}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {e.plannedSets} × {formatRange([e.repMin, e.repMax])}
                      </p>
                      {original?.reason ? (
                        <p className="text-sm text-muted-foreground">{original.reason}</p>
                      ) : original?.swapped ? (
                        <p className="text-sm text-muted-foreground">Escolhido por você.</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Surface>
          </section>
        );
      })}

      {view ? <VolumeSection proposal={view.proposal} profile={view.profile} /> : null}

      <ChangesHistory changes={history} />

      <div className="space-y-2">
        {view ? (
          <Button size="lg" className="w-full" onClick={() => setAdjustOpen(true)}>
            <Sparkles aria-hidden /> Ajustar o plano
          </Button>
        ) : null}
        <Button size="lg" variant="outline" className="w-full" asChild>
          <Link href="/treino">Ir para as fichas</Link>
        </Button>
        <Button size="lg" variant="ghost" className="w-full" onClick={() => void generateProposal({ split: record.option })}>
          <Sparkles aria-hidden /> Gerar um plano novo
        </Button>
        <Button size="lg" variant="ghost" className="w-full" asChild>
          <Link href="/treino/plano/perguntas">Refazer as perguntas</Link>
        </Button>
      </div>

      {view ? (
        <>
          <AdjustSheet
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            proposal={view.proposal}
            days={view.proposal.skeleton.days}
            nameOf={keyName}
            showSplit={false}
            profile={view.profile}
            exercises={data.exercises}
            onApply={(changes, meta) => void apply(changes, meta)}
            onPickExercise={setSwapSlot}
          />
          {suggestion && suggestionOpen > 0 ? (
            <AdjustSheet
              key={`suggestion-${suggestionOpen}`}
              open
              onOpenChange={(open) => (open ? undefined : setSuggestionOpen(0))}
              proposal={view.proposal}
              days={view.proposal.skeleton.days}
              nameOf={keyName}
              showSplit={false}
              profile={view.profile}
              exercises={data.exercises}
              initial={{ changes: [suggestion], trigger: "sugestao" }}
              onApply={(changes, meta) => void apply(changes, meta)}
              onPickExercise={setSwapSlot}
            />
          ) : null}
          <SwapSheet
            proposal={view.proposal}
            slotId={swapSlot}
            exercises={data.exercises}
            onClose={() => setSwapSlot(null)}
            onPick={(slotId, exerciseKey) =>
              void apply([{ change: { kind: "swap", slotId, exerciseKey }, reason: "Trocado por preferência sua.", principle: "variacao" }], {
                trigger: "troca",
                source: "rules",
                promptVersion: "troca-v1",
              })
            }
          />
        </>
      ) : null}
    </div>
  );
}
