"use client";

import { useState, type ReactNode } from "react";
import { create } from "zustand";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/shared/notify";
import { Sheet } from "@/components/shared/sheet";
import {
  GOAL_LABELS,
  MAX_PRIORITIES,
  PRIORITY_GROUPS,
  PRIORITY_LABELS,
  SESSION_MINUTES,
  SPLIT_LABELS,
  TRAINING_DAYS,
} from "@/domain/training-profile";
import type { PlanProposal } from "@/domain/training-proposal";
import { formatFrequency, splitFrequency } from "@/domain/training-rules";
import {
  DAY_TEMPLATES,
  availableSplits,
  defaultSplit,
  scheduleLabel,
  splitLetters,
  splitOption,
  type SplitOption,
} from "@/domain/training-splits";
import type { PriorityGroup, TrainingProfile } from "@/domain/types";
import { useActions } from "@/data";
import { pluralize } from "@/lib/format";
import { generateProposal } from "./generate";

type Panel = "split" | "days" | "minutes" | "focus" | null;

/** Qual folha do cabeçalho está aberta. Fora do componente para o "Ajustar o plano" conseguir abrir a das divisões. */
export const usePlanPanel = create<{ panel: Panel; setPanel: (panel: Panel) => void }>((set) => ({
  panel: null,
  setPanel: (panel) => set({ panel }),
}));

function SettingChip({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}. Mudar`}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium transition active:scale-[0.98] active:bg-muted"
    >
      {value}
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
    </button>
  );
}

function ChoiceButton({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition active:scale-[0.99] active:bg-m-soft",
        selected && "border-m bg-m-soft",
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {selected ? <Check className="size-5 shrink-0 text-m-ink" aria-hidden /> : null}
    </button>
  );
}

function SplitCard({
  option,
  daysPerWeek,
  recommended,
  selected,
  onPick,
}: {
  option: SplitOption;
  daysPerWeek: number;
  recommended: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const count = option.days.length;
  return (
    <ChoiceButton selected={selected} onClick={onPick}>
      <span className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider">{splitLetters(count)}</span>
        <span className="font-semibold">{option.title}</span>
        {recommended ? <span className="rounded-full bg-m-soft px-2 py-0.5 text-xs font-semibold text-m-ink">Recomendado</span> : null}
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">{option.days.map((kind) => DAY_TEMPLATES[kind].name).join(" · ")}</span>
      <span className="mt-0.5 block text-sm text-muted-foreground">
        {count} {pluralize(count, "treino", "treinos")} · cada músculo {formatFrequency(splitFrequency(option, daysPerWeek))} por semana
      </span>
      {option.note ? <span className="mt-1 block text-sm text-warning-ink">{option.note}</span> : null}
    </ChoiceButton>
  );
}

/**
 * As divisões possíveis: a recomendada e as 2 mais próximas dela primeiro (o resto atrás de "Ver todas"), para não
 * despejar 9 cartões de uma vez em quem só quer entender o que recebeu.
 */
function SplitSheet({
  open,
  onOpenChange,
  profile,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: TrainingProfile;
  current: string;
  onPick: (option: SplitOption) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const recommended = defaultSplit(profile);
  const available = availableSplits(profile.daysPerWeek);
  const ordered = [recommended, ...available.filter((o) => o.id !== recommended.id).sort(
    (a, b) => Math.abs(a.days.length - recommended.days.length) - Math.abs(b.days.length - recommended.days.length),
  )];
  const visible = showAll ? ordered : ordered.slice(0, 3);
  // A escolhida aparece sempre, mesmo que esteja entre as escondidas.
  const shown = visible.some((o) => o.id === current) ? visible : [...visible, ...ordered.filter((o) => o.id === current)];
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setShowAll(false);
        onOpenChange(next);
      }}
      module="workout"
      title="Como dividir seus treinos"
      description={`Você treina ${profile.daysPerWeek} dias por semana. Não precisa ser um treino diferente por dia: os treinos se revezam em sequência.`}
    >
      <div className="space-y-2">
        {shown.map((option) => (
          <SplitCard
            key={option.id}
            option={option}
            daysPerWeek={profile.daysPerWeek}
            recommended={option.id === recommended.id}
            selected={option.id === current}
            onPick={() => onPick(option)}
          />
        ))}
        {!showAll && ordered.length > shown.length ? (
          <Button variant="ghost" className="w-full" onClick={() => setShowAll(true)}>
            Ver todas as divisões ({ordered.length})
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

function FocusSheet({
  open,
  onOpenChange,
  initial,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: readonly PriorityGroup[];
  onApply: (priorities: PriorityGroup[]) => void;
}) {
  const [picked, setPicked] = useState<PriorityGroup[]>([...initial]);
  const toggle = (group: PriorityGroup) =>
    setPicked((list) => (list.includes(group) ? list.filter((g) => g !== group) : list.length < MAX_PRIORITIES ? [...list, group] : list));
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setPicked([...initial]);
        onOpenChange(next);
      }}
      module="workout"
      title="Mais atenção a algum grupo?"
      description={`Até ${MAX_PRIORITIES}. Esses grupos ganham uma série a mais.`}
      footer={
        <Button size="lg" className="w-full" onClick={() => onApply(picked)}>
          {picked.length === 0 ? "Sem foco, montar de novo" : "Montar de novo com este foco"}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {PRIORITY_GROUPS.map((group) => (
          <ChoiceButton key={group} selected={picked.includes(group)} onClick={() => toggle(group)}>
            <span className="font-medium">{PRIORITY_LABELS[group]}</span>
          </ChoiceButton>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * Cabeçalho do rascunho: o que a pessoa recebeu, em português simples ("3 treinos que se revezam nos seus 5 dias"), e
 * chips para mudar divisão, dias, tempo e foco sem refazer o formulário. Mudar qualquer um salva as respostas (dias,
 * tempo, foco) e monta o plano de novo pelo mesmo caminho do "Gerar outro".
 */
export function PlanHeader({ proposal, profile }: { proposal: PlanProposal; profile: TrainingProfile | null }) {
  const { saveTrainingProfile } = useActions();
  const panel = usePlanPanel((s) => s.panel);
  const setPanel = usePlanPanel((s) => s.setPanel);
  const skeleton = proposal.skeleton;
  const count = skeleton.days.length;
  const daysPerWeek = skeleton.daysPerWeek ?? profile?.daysPerWeek ?? count;
  const option = splitOption(skeleton.option);
  const title = option?.title ?? SPLIT_LABELS[skeleton.split];
  const close = () => setPanel(null);

  /** Salva as respostas novas e monta de novo. A divisão escolhida continua, se ainda couber e não era só o padrão. */
  async function rebuild(change: Partial<Omit<TrainingProfile, "updatedAt">>) {
    if (!profile) return;
    close();
    const { updatedAt: _updatedAt, ...answers } = profile;
    void _updatedAt;
    const next = { ...answers, ...change };
    if (!notify(await saveTrainingProfile(next))) return;
    const chosen = skeleton.option && skeleton.option !== defaultSplit(profile).id ? skeleton.option : undefined;
    const keep = chosen && availableSplits(next.daysPerWeek).some((o) => o.id === chosen) ? chosen : undefined;
    await generateProposal({ split: keep });
  }

  return (
    <div className="space-y-3 px-1">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{proposal.source === "ai" ? "Plano montado com IA" : "Plano do modelo pronto"}</p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {profile ? `${GOAL_LABELS[profile.goal].label} · ` : ""}
          {scheduleLabel(daysPerWeek, count)}
        </p>
      </div>
      {profile ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ajustar o plano">
          <SettingChip label="Divisão" value={`${count} ${pluralize(count, "treino", "treinos")} · ${splitLetters(count)}`} onClick={() => setPanel("split")} />
          <SettingChip label="Dias por semana" value={`${profile.daysPerWeek} ${pluralize(profile.daysPerWeek, "dia", "dias")}`} onClick={() => setPanel("days")} />
          <SettingChip label="Tempo por treino" value={`até ${profile.sessionMinutes} min`} onClick={() => setPanel("minutes")} />
          <SettingChip
            label="Foco"
            value={profile.priorities.length ? `Foco: ${profile.priorities.map((p) => PRIORITY_LABELS[p]).join(", ")}` : "Sem foco"}
            onClick={() => setPanel("focus")}
          />
        </div>
      ) : null}

      {profile ? (
        <>
          <SplitSheet
            open={panel === "split"}
            onOpenChange={(open) => setPanel(open ? "split" : null)}
            profile={profile}
            current={skeleton.option ?? defaultSplit(profile).id}
            onPick={(picked) => {
              close();
              if (picked.id !== skeleton.option) void generateProposal({ split: picked.id });
            }}
          />
          <Sheet
            open={panel === "days"}
            onOpenChange={(open) => setPanel(open ? "days" : null)}
            module="workout"
            title="Dias por semana"
            description="Conte só os dias de musculação."
          >
            <div className="grid grid-cols-5 gap-2">
              {TRAINING_DAYS.map((days) => (
                <ChoiceButton
                  key={days}
                  label={`${days} dias`}
                  selected={profile.daysPerWeek === days}
                  onClick={() => (days === profile.daysPerWeek ? close() : void rebuild({ daysPerWeek: days }))}
                >
                  <span className="block text-center font-semibold tabular-nums">{days}</span>
                </ChoiceButton>
              ))}
            </div>
          </Sheet>
          <Sheet
            open={panel === "minutes"}
            onOpenChange={(open) => setPanel(open ? "minutes" : null)}
            module="workout"
            title="Tempo por treino"
            description="Incluindo uns 5 minutos de aquecimento."
          >
            <div className="grid grid-cols-2 gap-2">
              {SESSION_MINUTES.map((minutes) => (
                <ChoiceButton
                  key={minutes}
                  selected={profile.sessionMinutes === minutes}
                  onClick={() => (minutes === profile.sessionMinutes ? close() : void rebuild({ sessionMinutes: minutes }))}
                >
                  <span className="font-semibold">{minutes === 75 ? "75 min ou mais" : `${minutes} min`}</span>
                </ChoiceButton>
              ))}
            </div>
          </Sheet>
          <FocusSheet
            open={panel === "focus"}
            onOpenChange={(open) => setPanel(open ? "focus" : null)}
            initial={profile.priorities}
            onApply={(priorities) => void rebuild({ priorities })}
          />
        </>
      ) : null}
    </div>
  );
}
