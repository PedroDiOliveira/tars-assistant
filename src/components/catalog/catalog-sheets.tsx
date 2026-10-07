"use client";

import { useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/components/shared/notify";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import type { Category, Exercise, Subject, TxType } from "@/domain/types";
import { useActions } from "@/data";
import { CATEGORY_ICONS, CATEGORY_ICON_LABELS, categoryIcon } from "@/lib/icons";

/** Rodapé comum: salvar e arquivar/restaurar (arquivar pede confirmação; restaurar é imediato). */
function ArchiveFooter({
  saveLabel,
  canSave,
  onSave,
  archived,
  editing,
  noun,
  onArchive,
}: {
  saveLabel: string;
  canSave: boolean;
  onSave: () => void;
  archived: boolean;
  editing: boolean;
  noun: string;
  onArchive: (archive: boolean) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <SheetFooter>
        <Button size="lg" disabled={!canSave} onClick={onSave}>
          {saveLabel}
        </Button>
        {editing ? (
          archived ? (
            <Button variant="outline" size="lg" onClick={() => void onArchive(false)}>
              Restaurar {noun}
            </Button>
          ) : (
            <Button variant="ghost" size="lg" className="text-destructive" onClick={() => setConfirm(true)}>
              Arquivar {noun}
            </Button>
          )
        ) : null}
      </SheetFooter>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Arquivar ${noun}?`}
        description="Some das escolhas para novos registros, mas o histórico que já usa continua intacto. Dá para restaurar depois."
        confirmLabel="Arquivar"
        destructive
        onConfirm={() => void onArchive(true)}
      />
    </>
  );
}

/* ---------- categoria ---------- */

export function CategorySheet({
  open,
  onOpenChange,
  category,
  newType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** categoria a editar; sem ela, cria uma nova do tipo `newType` */
  category: Category | null;
  newType: TxType;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={category ? "Editar categoria" : "Nova categoria"} module="finance">
      {open ? <CategoryForm key={category?.id ?? `new-${newType}`} category={category} newType={newType} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function CategoryForm({ category, newType, onDone }: { category: Category | null; newType: TxType; onDone: () => void }) {
  const { addCategory, updateCategory, archiveCategory } = useActions();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "dots");
  const submitted = useRef(false);
  const type = category?.type ?? newType;

  async function save() {
    if (submitted.current || name.trim() === "") return;
    submitted.current = true;
    const result = category
      ? await updateCategory(category.id, { name: name.trim(), icon, hue: category.hue })
      : await addCategory({ name: name.trim(), type, icon });
    if (!notify(result, category ? "Categoria atualizada" : "Categoria criada")) {
      submitted.current = false;
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{type === "income" ? "Categoria de receita" : "Categoria de despesa"}</p>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Nome</span>
        <Input autoFocus={!category} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícone</p>
        <div role="radiogroup" aria-label="Ícone" className="grid grid-cols-5 gap-2">
          {Object.keys(CATEGORY_ICONS).map((key) => {
            const Icon = categoryIcon(key);
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={CATEGORY_ICON_LABELS[key] ?? key}
                onClick={() => setIcon(key)}
                className={cn(
                  "grid h-12 place-items-center rounded-xl border transition",
                  icon === key ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>
      <ArchiveFooter
        saveLabel={category ? "Salvar alterações" : "Criar categoria"}
        canSave={name.trim() !== ""}
        onSave={save}
        archived={Boolean(category?.archived)}
        editing={category !== null}
        noun="categoria"
        onArchive={async (archive) => {
          if (category && notify(await archiveCategory(category.id, archive), archive ? "Categoria arquivada" : "Categoria restaurada")) onDone();
        }}
      />
    </div>
  );
}

/* ---------- exercício ---------- */

export function ExerciseSheet({
  open,
  onOpenChange,
  exercise,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={exercise ? "Editar exercício" : "Novo exercício"} module="workout">
      {open ? <ExerciseForm key={exercise?.id ?? "new"} exercise={exercise} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function ExerciseForm({ exercise, onDone }: { exercise: Exercise | null; onDone: () => void }) {
  const { addExercise, updateExercise, archiveExercise } = useActions();
  const [name, setName] = useState(exercise?.name ?? "");
  const [group, setGroup] = useState(exercise?.muscleGroup ?? "");
  const [loadType, setLoadType] = useState<Exercise["loadType"]>(exercise?.loadType ?? "external");
  const submitted = useRef(false);
  const valid = name.trim() !== "" && group.trim() !== "";

  async function save() {
    if (submitted.current || !valid) return;
    submitted.current = true;
    const fields = { name: name.trim(), muscleGroup: group.trim(), loadType };
    const result = exercise ? await updateExercise(exercise.id, fields) : await addExercise(fields);
    if (!notify(result, exercise ? "Exercício atualizado" : "Exercício criado")) {
      submitted.current = false;
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Nome</span>
        <Input autoFocus={!exercise} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Grupo muscular</span>
        <Input value={group} maxLength={30} placeholder="Ex.: Peito" onChange={(e) => setGroup(e.target.value)} />
      </label>
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
        <p className="text-sm text-muted-foreground">Peso do corpo não entra no cálculo de volume.</p>
      </div>
      <ArchiveFooter
        saveLabel={exercise ? "Salvar alterações" : "Criar exercício"}
        canSave={valid}
        onSave={save}
        archived={Boolean(exercise?.archived)}
        editing={exercise !== null}
        noun="exercício"
        onArchive={async (archive) => {
          if (exercise && notify(await archiveExercise(exercise.id, archive), archive ? "Exercício arquivado" : "Exercício restaurado")) onDone();
        }}
      />
    </div>
  );
}

/* ---------- matéria ---------- */

export function SubjectSheet({
  open,
  onOpenChange,
  subject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: Subject | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={subject ? "Editar matéria" : "Nova matéria"} module="study">
      {open ? <SubjectForm key={subject?.id ?? "new"} subject={subject} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function SubjectForm({ subject, onDone }: { subject: Subject | null; onDone: () => void }) {
  const { addSubject, updateSubject, archiveSubject } = useActions();
  const [name, setName] = useState(subject?.name ?? "");
  const [objective, setObjective] = useState(subject?.objective ?? "");
  const submitted = useRef(false);

  async function save() {
    if (submitted.current || name.trim() === "") return;
    submitted.current = true;
    const result = subject
      ? await updateSubject(subject.id, { name: name.trim(), objective: objective.trim() || undefined })
      : await addSubject(name.trim(), objective.trim() || undefined);
    if (!notify(result, subject ? "Matéria atualizada" : "Matéria criada")) {
      submitted.current = false;
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Nome</span>
        <Input autoFocus={!subject} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Objetivo <span className="font-normal text-muted-foreground">(opcional)</span>
        </span>
        <Input value={objective} maxLength={60} placeholder="Ex.: Banco do Brasil" onChange={(e) => setObjective(e.target.value)} />
      </label>
      <ArchiveFooter
        saveLabel={subject ? "Salvar alterações" : "Criar matéria"}
        canSave={name.trim() !== ""}
        onSave={save}
        archived={Boolean(subject?.archived)}
        editing={subject !== null}
        noun="matéria"
        onArchive={async (archive) => {
          if (subject && notify(await archiveSubject(subject.id, archive), archive ? "Matéria arquivada" : "Matéria restaurada")) onDone();
        }}
      />
    </div>
  );
}
