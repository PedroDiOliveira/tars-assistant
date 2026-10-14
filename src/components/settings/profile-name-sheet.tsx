"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/shared/notify";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { MAX_DISPLAY_NAME_LENGTH, parseDisplayName } from "@/domain/profile";
import { updateDisplayName } from "@/data";

interface ProfileNameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** nome atual; vazio quando a conta ainda não tem um */
  currentName: string;
}

/** Edição do nome de exibição (saudação, avatar). O e-mail de login não muda por aqui. */
export function ProfileNameSheet({ open, onOpenChange, currentName }: ProfileNameSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Editar nome"
      description="É como você aparece no app. O e-mail que você usa para entrar não muda."
    >
      {open ? <ProfileNameForm currentName={currentName} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function ProfileNameForm({ currentName, onDone }: { currentName: string; onDone: () => void }) {
  const [text, setText] = useState(currentName);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitted = useRef(false);

  // A mesma regra do servidor, só para dar o retorno antes de ir à rede. Quem vale é o servidor.
  const parsed = parseDisplayName(text);
  const unchanged = parsed.ok && parsed.name === currentName;
  // Sem mexer no campo não há o que criticar (uma conta sem nome ainda abre o editor vazio, sem aviso); o botão já fica travado.
  const error = serverError ?? (parsed.ok || text === currentName ? null : parsed.error);

  function edit(next: string) {
    setText(next);
    setServerError(null);
  }

  async function save() {
    if (!parsed.ok || unchanged || submitted.current) return;
    submitted.current = true;
    setSaving(true);
    const result = await updateDisplayName(parsed.name);
    setSaving(false);
    // Recusa de regra (o servidor viu algo que o formulário não viu): fica no campo, não some num aviso.
    if (!result.ok && result.code === "validation") {
      submitted.current = false;
      setServerError(result.error);
      return;
    }
    if (!notify(result, "Nome atualizado")) {
      submitted.current = false;
      return;
    }
    onDone();
  }

  return (
    <form
      className="space-y-5"
      data-module="primary"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-2">
        <label htmlFor="profile-name" className="text-sm font-medium">
          Nome
        </label>
        <Input
          id="profile-name"
          value={text}
          onChange={(event) => edit(event.target.value)}
          // Em unidades UTF-16: nunca deixa passar do limite de 60 caracteres (um emoji ocupa 2, então só sobra folga).
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoComplete="nickname"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={error !== null}
          aria-describedby={error ? "profile-name-error" : undefined}
          onFocus={(event) => event.currentTarget.select()}
        />
        <p id="profile-name-error" role="alert" className={error ? "rounded-xl bg-danger-soft p-3 text-sm text-danger-ink" : "sr-only"}>
          {error}
        </p>
      </div>

      <SheetFooter>
        <Button type="submit" size="lg" disabled={!parsed.ok || unchanged || saving}>
          {saving ? "Salvando…" : "Salvar nome"}
        </Button>
      </SheetFooter>
    </form>
  );
}
