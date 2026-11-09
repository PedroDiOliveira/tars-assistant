"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, ListChecks, MoreHorizontal, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/components/shared/notify";
import { Sheet } from "@/components/shared/sheet";
import { Surface } from "@/components/shared/surface";
import { SEGMENT_TRACK, segmentItem } from "@/components/shared/segmented-styles";
import { activeOnly } from "@/domain/catalog";
import { EQUIPMENT_LABELS, libraryEntry } from "@/domain/exercise-library";
import { FALLBACK_MESSAGES, existingExercise, type PlanProposal } from "@/domain/training-proposal";
import { dayMinutes, dayOverBudget, knownLibraryKeys, lateMainSlots, swapOptions } from "@/domain/training-rules";
import { dayLetter } from "@/domain/training-splits";
import type { Exercise } from "@/domain/types";
import { useActions, useData, usePlanProposal } from "@/data";
import { pluralize } from "@/lib/format";
import { AdjustSheet } from "./adjust-sheet";
import { AssistantNote } from "./assistant-note";
import { ExerciseSheet } from "./exercise-sheet";
import { generateProposal } from "./generate";
import { PlanHeader } from "./plan-settings";
import { ScienceSection } from "./science-section";
import { VolumeSection } from "./volume-section";
import { SortableDay } from "./sortable-day";

/** Nome que vai aparecer na ficha: o do exercício que a pessoa já tem, ou o da biblioteca. */
export function exerciseName(exercises: readonly Exercise[], key: string): string {
  return existingExercise(exercises, key)?.name ?? libraryEntry(key)?.name ?? key;
}


/** Avisa a última edição com "Desfazer" (fora de folhas abertas: com o modal aberto o toast não recebe toque). */
function undoToast(message: string) {
  toast(message, {
    action: {
      label: "Desfazer",
      onClick: () => {
        if (usePlanProposal.getState().undo()) toast("Desfeito.");
      },
    },
  });
}

/**
 * As opções de troca de uma vaga. No rascunho, a troca vai para o store (com Desfazer); no plano em uso, `onPick`
 * grava a troca nas fichas.
 */
export function SwapSheet({
  proposal,
  slotId,
  exercises,
  onClose,
  onPick,
}: {
  proposal: PlanProposal;
  slotId: string | null;
  exercises: readonly Exercise[];
  onClose: () => void;
  onPick?: (slotId: string, exerciseKey: string) => void;
}) {
  const swap = usePlanProposal((s) => s.swap);
  const known = useMemo(() => knownLibraryKeys(exercises), [exercises]);
  const options = slotId ? swapOptions(proposal.skeleton, proposal.choices, slotId) : [];
  const current = slotId ? proposal.choices[slotId] : undefined;
  return (
    <Sheet
      open={slotId !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      module="workout"
      title="Trocar exercício"
      description={current ? `No lugar de ${exerciseName(exercises, current.exerciseKey)}. As opções trabalham o mesmo grupo.` : undefined}
    >
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">Não há outra opção permitida para esta vaga.</p>
      ) : (
        <ul className="space-y-2">
          {options.map((key) => {
            const entry = libraryEntry(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    if (!slotId) return;
                    if (onPick) {
                      onClose();
                      onPick(slotId, key);
                      return;
                    }
                    if (!swap(slotId, key)) return;
                    onClose();
                    undoToast(`Trocado por ${exerciseName(exercises, key)}.`);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition active:scale-[0.99] active:bg-m-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{exerciseName(exercises, key)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {entry ? EQUIPMENT_LABELS[entry.equipment] : ""}
                      {known.has(key) ? " · você já faz" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

function ApplySheet({ open, onOpenChange, proposal }: { open: boolean; onOpenChange: (open: boolean) => void; proposal: PlanProposal }) {
  const data = useData();
  const router = useRouter();
  const { applyTrainingPlan } = useActions();
  const clear = usePlanProposal((s) => s.clear);
  const current = useMemo(() => activeOnly(data.plans), [data.plans]);
  const [archive, setArchive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    const result = await applyTrainingPlan({ proposal, archivePlanIds: archive ? current.map((p) => p.id) : [] });
    setSaving(false);
    if (!notify(result, "Plano salvo: as fichas novas estão em Começar treino.")) return;
    clear();
    onOpenChange(false);
    router.push("/treino");
  }

  const count = proposal.skeleton.days.length;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      module="workout"
      title="Usar este plano"
      description={`${count} ${pluralize(count, "ficha nova vai aparecer", "fichas novas vão aparecer")} em Começar treino. O histórico dos seus treinos não muda.`}
      footer={
        <Button size="lg" className="w-full" disabled={saving} onClick={() => void apply()}>
          {saving ? "Salvando…" : "Usar este plano"}
        </Button>
      }
    >
      {current.length > 0 ? (
        <label className="flex items-start gap-3 rounded-2xl border bg-card p-4">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Arquivar minhas fichas atuais</span>
            <span className="block text-sm text-muted-foreground">{current.map((p) => p.name).join(", ")}. Dá para desarquivar depois.</span>
          </span>
          <Switch checked={archive} onCheckedChange={setArchive} aria-label="Arquivar minhas fichas atuais" />
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">Você ainda não tem fichas: estas serão as primeiras.</p>
      )}
    </Sheet>
  );
}

/**
 * O que é raro no rascunho fica num menu, para a tela ter uma ação principal só ("Usar este plano"): gerar outro,
 * refazer as perguntas e descartar.
 */
export function ProposalMenu() {
  const [open, setOpen] = useState(false);
  const clear = usePlanProposal((s) => s.clear);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Mais opções do plano" onClick={() => setOpen(true)}>
        <MoreHorizontal aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen} module="workout" title="Mais opções">
        <div className="space-y-2">
          <Button
            size="lg"
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setOpen(false);
              // Outro plano com a MESMA divisão que está no rascunho (escolhida ou não).
              void generateProposal({ split: usePlanProposal.getState().proposal?.skeleton.option });
            }}
          >
            <Sparkles aria-hidden /> Gerar outro plano
          </Button>
          <Button size="lg" variant="outline" className="w-full justify-start" asChild>
            <Link href="/treino/plano/perguntas" onClick={() => setOpen(false)}>
              <RotateCcw aria-hidden /> Refazer as perguntas
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full justify-start text-destructive"
            onClick={() => {
              setOpen(false);
              clear();
            }}
          >
            <Trash2 aria-hidden /> Descartar este plano
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** Um treino por vez na tela: as letras viram abas (A | B | C). */
function DayTabs({ proposal, active, onChange }: { proposal: PlanProposal; active: string; onChange: (dayId: string) => void }) {
  const days = proposal.skeleton.days;
  if (days.length < 2) return null;
  return (
    <div role="tablist" aria-label="Treinos do plano" className={SEGMENT_TRACK}>
      {days.map((day, i) => (
        <button
          key={day.id}
          type="button"
          role="tab"
          id={`plan-tab-${day.id}`}
          aria-selected={day.id === active}
          aria-controls={`plan-panel-${day.id}`}
          aria-label={`Treino ${dayLetter(i)}: ${day.name}`}
          onClick={() => onChange(day.id)}
          className={cn(segmentItem(day.id === active), dayOverBudget(proposal.skeleton, day, proposal.choices) && "text-warning-ink")}
        >
          {dayLetter(i)}
        </button>
      ))}
    </div>
  );
}

export function ProposalReview({ proposal, stale }: { proposal: PlanProposal; stale: boolean }) {
  const data = useData();
  const move = usePlanProposal((s) => s.move);
  const known = useMemo(() => knownLibraryKeys(data.exercises), [data.exercises]);
  const [activeDay, setActiveDay] = useState(proposal.skeleton.days[0].id);
  const [detailSlot, setDetailSlot] = useState<string | null>(null);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const adjust = usePlanProposal((s) => s.adjust);
  const profile = data.trainingProfile;
  const nameOf = (key: string) => exerciseName(data.exercises, key);

  const days = proposal.skeleton.days;
  const index = Math.max(0, days.findIndex((d) => d.id === activeDay));
  const day = days[index];
  const over = dayOverBudget(proposal.skeleton, day, proposal.choices);
  const late = new Set(lateMainSlots(day));

  return (
    <div className="space-y-5">
      <PlanHeader proposal={proposal} profile={profile} />

      {stale ? (
        <Surface className="flex items-start gap-3 p-4 text-sm" role="alert">
          <Info className="mt-0.5 size-4 shrink-0 text-m-ink" aria-hidden />
          <span className="min-w-0 flex-1">Suas respostas mudaram depois deste plano. Gere um plano novo com elas.</span>
        </Surface>
      ) : proposal.fallback && proposal.fallback !== "ai_off" ? (
        <Surface className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-muted-foreground">{FALLBACK_MESSAGES[proposal.fallback]}</span>
        </Surface>
      ) : null}

      <AssistantNote source={proposal.source} extra="as fontes estão em “Por que este treino funciona”, no fim">
        {proposal.summary}
      </AssistantNote>

      <DayTabs proposal={proposal} active={day.id} onChange={setActiveDay} />

      <section
        id={`plan-panel-${day.id}`}
        role={days.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={days.length > 1 ? `plan-tab-${day.id}` : undefined}
        aria-label={days.length > 1 ? undefined : day.name}
        className="space-y-2"
      >
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h3 className="font-semibold">{day.name}</h3>
          <p className={cn("text-right text-sm tabular-nums", over ? "text-warning-ink" : "text-muted-foreground")}>
            cerca de {dayMinutes(day, proposal.choices)} min
            {over
              ? " · passa do seu tempo"
              : Number.isInteger(proposal.skeleton.timesPerWeek) && proposal.skeleton.timesPerWeek > 1
                ? ` · ${proposal.skeleton.timesPerWeek}x por semana`
                : ""}
          </p>
        </div>
        <Surface className="overflow-hidden">
          <SortableDay
            day={day}
            choices={proposal.choices}
            nameOf={nameOf}
            isKnown={(key) => known.has(key)}
            lateSlots={late}
            readOnly={stale}
            onMove={(from, to) => {
              if (move(day.id, from, to)) undoToast("Ordem alterada.");
            }}
            onOpen={setDetailSlot}
            onSwap={setSwapSlot}
          />
        </Surface>
        {stale ? null : (
          <p className="px-1 text-sm text-muted-foreground">Arraste pela alça para mudar a ordem, ou toque num exercício para ajustar séries e repetições.</p>
        )}
      </section>

      {profile && !stale ? <VolumeSection proposal={proposal} profile={profile} /> : null}
      {profile && !stale ? <ScienceSection proposal={proposal} profile={profile} /> : null}

      <div className="space-y-2">
        {stale ? (
          <Button size="lg" className="w-full" onClick={() => void generateProposal()}>
            <Sparkles aria-hidden /> Gerar um plano novo
          </Button>
        ) : (
          <>
            <Button size="lg" className="w-full" onClick={() => setApplyOpen(true)}>
              <ListChecks aria-hidden /> Usar este plano
            </Button>
            <Button size="lg" variant="outline" className="w-full" onClick={() => setAdjustOpen(true)}>
              <Sparkles aria-hidden /> Ajustar o plano
            </Button>
          </>
        )}
      </div>

      <ExerciseSheet
        proposal={proposal}
        slotId={detailSlot}
        nameOf={nameOf}
        sessionMinutes={profile?.sessionMinutes ?? null}
        onClose={() => setDetailSlot(null)}
        onSwap={(slotId) => {
          // Uma folha por vez: fecha os detalhes e abre a troca.
          setDetailSlot(null);
          setSwapSlot(slotId);
        }}
      />
      <AdjustSheet
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        proposal={proposal}
        days={[day]}
        profile={profile}
        exercises={data.exercises}
        nameOf={nameOf}
        onApply={(changes) => {
          const count = adjust(changes);
          if (count > 0) undoToast(count === 1 ? "1 mudança aplicada." : `${count} mudanças aplicadas.`);
          else toast.error("Essas mudanças não valem mais neste rascunho.");
        }}
        onPickExercise={setSwapSlot}
      />
      <SwapSheet proposal={proposal} slotId={swapSlot} exercises={data.exercises} onClose={() => setSwapSlot(null)} />
      <ApplySheet open={applyOpen} onOpenChange={setApplyOpen} proposal={proposal} />
    </div>
  );
}
