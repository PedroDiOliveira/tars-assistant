"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Dumbbell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withStoreGate } from "@/components/layout/store-gate";
import { SubHeader } from "@/components/layout/sub-header";
import { HueBubble, HueDot } from "@/components/shared/hue-bubble";
import { notify } from "@/components/shared/notify";
import { SectionTitle } from "@/components/shared/section-title";
import { Surface } from "@/components/shared/surface";
import { isActive } from "@/domain/catalog";
import type { Category, Exercise, Subject, TxType } from "@/domain/types";
import { useActions, useData } from "@/data";
import { categoryIcon } from "@/lib/icons";
import { CategorySheet, ExerciseSheet, SubjectSheet } from "./catalog-sheets";

function Row({
  onClick,
  children,
  archived,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  archived?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition active:bg-muted/60"
    >
      <div className={archived ? "flex min-w-0 flex-1 items-center gap-3 opacity-60" : "flex min-w-0 flex-1 items-center gap-3"}>{children}</div>
      {archived ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Arquivada</span> : null}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />
    </button>
  );
}

/** Lista com os ativos e, atrás de um toque, os arquivados (que podem ser restaurados). */
function Archivable<T extends { id: string; archived?: boolean }>({
  items,
  render,
  empty,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  empty: string;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const active = items.filter(isActive);
  const archived = items.filter((i) => !isActive(i));
  return (
    <>
      {active.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border/70">{active.map((item) => <div key={item.id}>{render(item)}</div>)}</div>
      )}
      {archived.length > 0 ? (
        <div className="border-t border-border/70">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="flex min-h-11 w-full items-center px-4 text-sm font-medium text-muted-foreground transition active:bg-muted/60"
          >
            {showArchived ? "Ocultar arquivados" : `Ver arquivados (${archived.length})`}
          </button>
          {showArchived ? <div className="divide-y divide-border/70">{archived.map((item) => <div key={item.id}>{render(item)}</div>)}</div> : null}
        </div>
      ) : null}
    </>
  );
}

function CatalogScreenContent() {
  const data = useData();
  const { archivePlan } = useActions();

  const [category, setCategory] = useState<{ open: boolean; item: Category | null; type: TxType }>({ open: false, item: null, type: "expense" });
  const [exercise, setExercise] = useState<{ open: boolean; item: Exercise | null }>({ open: false, item: null });
  const [subject, setSubject] = useState<{ open: boolean; item: Subject | null }>({ open: false, item: null });

  const expense = useMemo(() => data.categories.filter((c) => c.type === "expense"), [data.categories]);
  const income = useMemo(() => data.categories.filter((c) => c.type === "income"), [data.categories]);
  const exercises = useMemo(
    () => [...data.exercises].sort((a, b) => a.muscleGroup.localeCompare(b.muscleGroup, "pt-BR") || a.name.localeCompare(b.name, "pt-BR")),
    [data.exercises],
  );
  const archivedPlans = useMemo(() => data.plans.filter((p) => !isActive(p)), [data.plans]);

  const categoryRow = (c: Category) => (
    <Row label={`Editar categoria ${c.name}`} archived={c.archived} onClick={() => setCategory({ open: true, item: c, type: c.type })}>
      <HueBubble hue={c.hue} icon={categoryIcon(c.icon)} />
      <span className="truncate font-medium">{c.name}</span>
    </Row>
  );

  return (
    <div data-module="primary" className="pb-10">
      <SubHeader title="Categorias, exercícios e matérias" backHref="/configuracoes" />

      <div className="space-y-6 px-4 pt-2">
        <p className="px-1 text-sm text-muted-foreground">
          O que já foi usado nunca é apagado: ao arquivar, o item some das escolhas, mas o histórico dele continua. Dá para restaurar.
        </p>

        <section className="space-y-3">
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" onClick={() => setCategory({ open: true, item: null, type: "expense" })}>
                <Plus aria-hidden /> Despesa
              </Button>
            }
          >
            Categorias de despesa
          </SectionTitle>
          <Surface className="overflow-hidden">
            <Archivable items={expense} render={categoryRow} empty="Nenhuma categoria de despesa." />
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" onClick={() => setCategory({ open: true, item: null, type: "income" })}>
                <Plus aria-hidden /> Receita
              </Button>
            }
          >
            Categorias de receita
          </SectionTitle>
          <Surface className="overflow-hidden">
            <Archivable items={income} render={categoryRow} empty="Nenhuma categoria de receita." />
          </Surface>
        </section>

        <section className="space-y-3" data-module="study">
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" onClick={() => setSubject({ open: true, item: null })}>
                <Plus aria-hidden /> Matéria
              </Button>
            }
          >
            Matérias
          </SectionTitle>
          <Surface className="overflow-hidden">
            <Archivable
              items={data.subjects}
              empty="Nenhuma matéria. Crie uma para registrar estudo."
              render={(s) => (
                <Row label={`Editar matéria ${s.name}`} archived={s.archived} onClick={() => setSubject({ open: true, item: s })}>
                  <HueDot hue={s.hue} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    {s.objective ? <p className="truncate text-sm text-muted-foreground">{s.objective}</p> : null}
                  </div>
                </Row>
              )}
            />
          </Surface>
        </section>

        <section className="space-y-3" data-module="workout">
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" onClick={() => setExercise({ open: true, item: null })}>
                <Plus aria-hidden /> Exercício
              </Button>
            }
          >
            Exercícios
          </SectionTitle>
          <Surface className="overflow-hidden">
            <Archivable
              items={exercises}
              empty="Nenhum exercício."
              render={(e) => (
                <Row label={`Editar exercício ${e.name}`} archived={e.archived} onClick={() => setExercise({ open: true, item: e })}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
                    <Dumbbell className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {e.muscleGroup}
                      {e.loadType === "bodyweight" ? " · peso do corpo" : ""}
                    </p>
                  </div>
                </Row>
              )}
            />
          </Surface>
        </section>

        {archivedPlans.length > 0 ? (
          <section className="space-y-3" data-module="workout">
            <SectionTitle hint="Treinos já feitos com elas continuam no histórico">Fichas arquivadas</SectionTitle>
            <Surface className="divide-y divide-border/70 overflow-hidden">
              {archivedPlans.map((plan) => (
                <div key={plan.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1 opacity-70">
                    <p className="truncate font-medium">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{plan.exercises.length} exercícios</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Restaurar ficha ${plan.name}`}
                    onClick={async () => void notify(await archivePlan(plan.id, false), "Ficha restaurada")}
                  >
                    Restaurar
                  </Button>
                </div>
              ))}
            </Surface>
          </section>
        ) : null}
      </div>

      <CategorySheet
        open={category.open}
        onOpenChange={(open) => setCategory((s) => ({ ...s, open }))}
        category={category.item}
        newType={category.type}
      />
      <ExerciseSheet open={exercise.open} onOpenChange={(open) => setExercise((s) => ({ ...s, open }))} exercise={exercise.item} />
      <SubjectSheet open={subject.open} onOpenChange={(open) => setSubject((s) => ({ ...s, open }))} subject={subject.item} />
    </div>
  );
}

export const CatalogScreen = withStoreGate(CatalogScreenContent);
