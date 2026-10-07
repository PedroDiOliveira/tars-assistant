"use client";

import { Sheet } from "@/components/shared/sheet";
import { useActions } from "@/data";
import { SubjectStarter } from "./subject-starter";
import { notify } from "@/components/shared/notify";

interface StudyStartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** chamada depois de iniciar o cronômetro (ex.: levar para a tela de Estudos) */
  onStarted?: () => void;
}

/** Escolhe a matéria e já inicia o cronômetro. Usado nas ações rápidas da Início. */
export function StudyStartSheet({ open, onOpenChange, onStarted }: StudyStartSheetProps) {
  const { startStudy } = useActions();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="O que vai estudar?"
      description="Toque numa matéria para iniciar o cronômetro."
      module="study"
    >
      <SubjectStarter
        onStart={(subjectId) => {
          // A tela já mostra o cronômetro; se o servidor recusar, o aviso de erro aparece e o estado volta.
          void startStudy(subjectId).then(notify);
          onOpenChange(false);
          onStarted?.();
        }}
      />
    </Sheet>
  );
}
