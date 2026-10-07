"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import type { BookStatus } from "@/domain/types";
import { useActions } from "@/data";

interface BookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookSheet({ open, onOpenChange }: BookSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Novo livro" module="reading">
      <BookForm onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function BookForm({ onDone }: { onDone: () => void }) {
  const { addBook } = useActions();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [totalText, setTotalText] = useState("");
  const [initialText, setInitialText] = useState("0");
  const [status, setStatus] = useState<Extract<BookStatus, "reading" | "want">>("reading");
  const submitted = useRef(false);

  const total = Number(totalText);
  const initial = Number(initialText);
  const valid =
    title.trim() !== "" && Number.isInteger(total) && total > 0 && Number.isInteger(initial) && initial >= 0 && initial < total;

  function save() {
    if (submitted.current || !valid) return;
    submitted.current = true;
    addBook({
      title: title.trim(),
      author: author.trim() || undefined,
      totalPages: total,
      initialPage: initial,
      status,
    });
    toast.success(`“${title.trim()}” adicionado`);
    onDone();
  }

  return (
    <div className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Título</span>
        <Input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Autor <span className="font-normal text-muted-foreground">(opcional)</span>
        </span>
        <Input value={author} maxLength={60} onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2">
          <span className="text-sm font-medium">Total de páginas</span>
          <Input inputMode="numeric" value={totalText} onChange={(e) => setTotalText(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Página atual</span>
          <Input inputMode="numeric" value={initialText} onChange={(e) => setInitialText(e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Se já começou o livro, informe a página em que está. As páginas anteriores não contam como leitura da semana.
      </p>
      <div className="space-y-2">
        <p className="text-sm font-medium">Situação</p>
        <Segmented
          ariaLabel="Situação do livro"
          value={status}
          onChange={setStatus}
          options={[
            { value: "reading", label: "Lendo" },
            { value: "want", label: "Quero ler" },
          ]}
        />
      </div>
      <SheetFooter>
        <Button size="lg" disabled={!valid} onClick={save}>
          Adicionar livro
        </Button>
      </SheetFooter>
    </div>
  );
}
