"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/components/shared/notify";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { NumberField } from "@/components/workouts/number-field";
import { activeOnly } from "@/domain/catalog";
import type { Exercise, PlanExercise, WorkoutPlan } from "@/domain/types";
import { useActions, useData } from "@/data";

const DEFAULT_ITEM = { plannedSets: 3, repMin: 8, repMax: 12, restSeconds: 90 } as const;

interface PlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ficha a editar; sem ela, cria uma nova */
  plan: WorkoutPlan | null;
}

export function PlanSheet({ open, onOpenChange, plan }: PlanSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? "Editar ficha" : "Nova ficha"}
      description="Nome, exercícios, séries e descanso. Treinos já feitos não mudam."
      module="workout"
    >
      {/* `key` reinicia o formulário a cada ficha aberta */}
      {open ? <PlanForm key={plan?.id ?? "new"} plan={plan} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

type View = "form" | "pick" | "new";

function PlanForm({ plan, onDone }: { plan: WorkoutPlan | null; onDone: () => void }) {
  const { exercises } = useData();
  const { savePlan, archivePlan } = useActions();

  const [view, setView] = useState<View>("form");
  const [name, setName] = useState(plan?.name ?? "");
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [items, setItems] = useState<PlanExercise[]>(plan?.exercises ?? []);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const submitted = useRef(false);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  function patchItem(index: number, patch: Partial<PlanExercise>) {
    setItems((all) => all.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function move(index: number, delta: -1 | 1) {
    setItems((all) => {
      const target = index + delta;
      if (target < 0 || target >= all.length) return all;
      const next = [...all];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function addExercise(exerciseId: string) {
    setItems((all) => (all.some((i) => i.exerciseId === exerciseId) ? all : [...all, { exerciseId, ...DEFAULT_ITEM }]));
    setView("form");
  }

  const itemError = (item: PlanExercise): string | null => {
    if (item.plannedSets < 1 || item.plannedSets > 20) return "Séries: de 1 a 20.";
    if (item.repMin < 1) return "Repetições mínimas: pelo menos 1.";
    if (item.repMax < item.repMin) return "As repetições máximas não podem ser menores que as mínimas.";
    return null;
  };
  const firstError = items.map(itemError).find((e) => e !== null) ?? null;
  const valid = name.trim() !== "" && items.length > 0 && firstError === null;

  async function save() {
    if (submitted.current || !valid) return;
    submitted.current = true;
    const result = await savePlan({
      id: plan?.id,
      name: name.trim(),
      notes: notes.trim() || undefined,
      exercises: items,
    });
    if (!notify(result, plan ? "Ficha atualizada" : "Ficha criada")) {
      submitted.current = false;
      return;
    }
    onDone();
  }

  if (view === "pick") {
    return (
      <ExercisePicker
        taken={new Set(items.map((i) => i.exerciseId))}
        onPick={addExercise}
        onNew={() => setView("new")}
        onBack={() => setView("form")}
      />
    );
  }
  if (view === "new") {
    return <NewExerciseForm onCreated={addExercise} onBack={() => setView("pick")} />;
  }

  return (
    <div className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Nome da ficha</span>
        <Input value={name} maxLength={60} placeholder="Ex.: Treino A — Peito e tríceps" onChange={(e) => setName(e.target.value)} autoFocus={!plan} />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Exercícios ({items.length})</p>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Adicione os exercícios na ordem em que você os faz.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => {
              const exercise = byId.get(item.exerciseId);
              const error = itemError(item);
              return (
                <li key={item.exerciseId} className="space-y-3 rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {exercise?.name ?? "Exercício"}
                        {exercise?.archived ? <span className="ml-2 text-xs font-normal text-muted-foreground">arquivado</span> : null}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{exercise?.muscleGroup}</p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Subir ${exercise?.name ?? "exercício"}`} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Descer ${exercise?.name ?? "exercício"}`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${exercise?.name ?? "exercício"} da ficha`}
                      onClick={() => setItems((all) => all.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
                    <div className="space-y-1">
                      <span>Séries</span>
                      <NumberField label="Séries" value={item.plannedSets} onChange={(v) => patchItem(index, { plannedSets: v })} />
                    </div>
                    <div className="space-y-1">
                      <span>Reps mín.</span>
                      <NumberField label="Repetições mínimas" value={item.repMin} onChange={(v) => patchItem(index, { repMin: v })} />
                    </div>
                    <div className="space-y-1">
                      <span>Reps máx.</span>
                      <NumberField label="Repetições máximas" value={item.repMax} onChange={(v) => patchItem(index, { repMax: v })} />
                    </div>
                    <div className="space-y-1">
                      <span>Descanso (s)</span>
                      <NumberField label="Descanso em segundos" value={item.restSeconds} onChange={(v) => patchItem(index, { restSeconds: v })} />
                    </div>
                  </div>
                  {error ? (
                    <p role="alert" className="text-sm text-danger-ink">
                      {error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="outline" size="lg" className="w-full" onClick={() => setView("pick")}>
          <Plus aria-hidden /> Adicionar exercício
        </Button>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Observações <span className="font-normal text-muted-foreground">(opcional)</span>
        </span>
        <Textarea rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <SheetFooter>
        <Button size="lg" disabled={!valid} onClick={save}>
          {plan ? "Salvar alterações" : "Criar ficha"}
        </Button>
        {plan ? (
          <Button variant="ghost" size="lg" className="text-destructive" onClick={() => setConfirmArchive(true)}>
            Arquivar ficha
          </Button>
        ) : null}
      </SheetFooter>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Arquivar esta ficha?"
        description="Ela some da lista para começar treinos, mas os treinos que você já fez continuam no histórico. Dá para restaurá-la em Configurações."
        confirmLabel="Arquivar"
        destructive
        onConfirm={async () => {
          if (!plan) return;
          if (notify(await archivePlan(plan.id, true), "Ficha arquivada")) onDone();
        }}
      />
    </div>
  );
}

/** Escolha do exercício: busca, agrupado por grupo muscular, sem os que já estão na ficha. */
function ExercisePicker({
  taken,
  onPick,
  onNew,
  onBack,
}: {
  taken: Set<string>;
  onPick: (exerciseId: string) => void;
  onNew: () => void;
  onBack: () => void;
}) {
  const { exercises } = useData();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const normalize = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const q = normalize(query.trim());
    const matches = activeOnly(exercises).filter(
      (e) => !taken.has(e.id) && (q === "" || normalize(e.name).includes(q) || normalize(e.muscleGroup).includes(q)),
    );
    const byGroup = new Map<string, Exercise[]>();
    for (const e of matches) byGroup.set(e.muscleGroup, [...(byGroup.get(e.muscleGroup) ?? []), e]);
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [exercises, taken, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Voltar para a ficha" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <p className="text-base font-semibold">Adicionar exercício</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} placeholder="Buscar exercício ou grupo" aria-label="Buscar exercício" onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          {query ? "Nenhum exercício encontrado." : "Todos os exercícios já estão na ficha."} Você pode criar um novo.
        </p>
      ) : (
        groups.map(([group, list]) => (
          <section key={group} className="space-y-1">
            <h3 className="px-1 text-sm font-semibold text-muted-foreground">{group}</h3>
            <ul className="divide-y rounded-xl border bg-card">
              {list.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => onPick(e.id)} className="flex min-h-12 w-full items-center gap-2 px-3 text-left transition active:bg-muted">
                    <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                    {e.loadType === "bodyweight" ? <span className="text-xs text-muted-foreground">peso do corpo</span> : null}
                    <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Button variant="outline" size="lg" className="w-full" onClick={onNew}>
        <Plus aria-hidden /> Criar novo exercício
      </Button>
    </div>
  );
}

function NewExerciseForm({ onCreated, onBack }: { onCreated: (exerciseId: string) => void; onBack: () => void }) {
  const { exercises } = useData();
  const { addExercise } = useActions();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [loadType, setLoadType] = useState<Exercise["loadType"]>("external");
  const submitted = useRef(false);

  const groups = useMemo(() => [...new Set(exercises.map((e) => e.muscleGroup))].sort((a, b) => a.localeCompare(b, "pt-BR")), [exercises]);
  const valid = name.trim() !== "" && group.trim() !== "";

  async function create() {
    if (submitted.current || !valid) return;
    submitted.current = true;
    const result = await addExercise({ name: name.trim(), muscleGroup: group.trim(), loadType });
    if (!notify(result)) {
      submitted.current = false;
      return;
    }
    onCreated(result.value.id);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Voltar" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <p className="text-base font-semibold">Novo exercício</p>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Nome</span>
        <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="space-y-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Grupo muscular</span>
          <Input value={group} maxLength={30} placeholder="Ex.: Peito" onChange={(e) => setGroup(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              aria-pressed={group === g}
              className="min-h-11 rounded-full border bg-card px-3.5 text-sm transition aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground active:bg-muted"
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Tipo de carga</p>
        <Segmented
          ariaLabel="Tipo de carga"
          value={loadType}
          onChange={setLoadType}
          options={[
            { value: "external", label: "Com carga" },
            { value: "bodyweight", label: "Peso do corpo" },
          ]}
        />
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!valid} onClick={create}>
          Criar e adicionar à ficha
        </Button>
      </SheetFooter>
    </div>
  );
}
