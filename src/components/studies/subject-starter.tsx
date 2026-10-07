"use client";

import { useEffect, useState } from "react";
import { Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HueDot } from "@/components/shared/hue-bubble";
import { useActions, useData } from "@/data";

interface SubjectStarterProps {
  /** chamada ao tocar numa matéria: inicia o cronômetro para ela */
  onStart: (subjectId: string) => void;
  /**
   * Tempo em que os botões ficam desarmados depois de aparecer. Evita que o segundo toque de um
   * duplo toque em "Finalizar" caia numa matéria (o layout muda sob o dedo) e inicie outro cronômetro.
   */
  armDelayMs?: number;
}

/** Lista de matérias como botões grandes: um toque inicia o cronômetro. */
export function SubjectStarter({ onStart, armDelayMs = 0 }: SubjectStarterProps) {
  const { subjects } = useData();
  const { addSubject } = useActions();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [armed, setArmed] = useState(armDelayMs === 0);

  useEffect(() => {
    if (armDelayMs === 0) return;
    const timer = setTimeout(() => setArmed(true), armDelayMs);
    return () => clearTimeout(timer);
  }, [armDelayMs]);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addSubject(trimmed);
    setName("");
    setAdding(false);
    onStart(id);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {subjects.map((subject) => (
          <button
            key={subject.id}
            type="button"
            disabled={!armed}
            onClick={() => onStart(subject.id)}
            className="flex min-h-14 items-center justify-between gap-1.5 rounded-xl border bg-card px-3 text-left font-medium transition active:bg-muted disabled:opacity-60"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <HueDot hue={subject.hue} />
              <span className="truncate">{subject.name}</span>
            </span>
            <Play className="size-4 shrink-0 text-m-ink" aria-hidden />
          </button>
        ))}
        <button
          type="button"
          disabled={!armed}
          onClick={() => setAdding(true)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-dashed px-3.5 text-sm font-medium text-muted-foreground transition active:bg-muted"
        >
          <Plus className="size-4" aria-hidden /> Nova matéria
        </button>
      </div>
      {adding ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={name}
            maxLength={30}
            placeholder="Nome da matéria"
            aria-label="Nome da nova matéria"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button onClick={create} disabled={name.trim() === ""}>
            Criar e iniciar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
