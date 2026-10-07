"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import type { Book, BookStatus } from "@/domain/types";
import { useActions } from "@/data";
import { notify } from "@/components/shared/notify";

interface BookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** livro a editar; sem ele, cadastra um novo */
  book?: Book | null;
}

export function BookSheet({ open, onOpenChange, book = null }: BookSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={book ? "Editar livro" : "Novo livro"} module="reading">
      {open ? <BookForm key={book?.id ?? "new"} book={book} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function BookForm({ book, onDone }: { book: Book | null; onDone: () => void }) {
  const { addBook, updateBook } = useActions();
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [totalText, setTotalText] = useState(book ? String(book.totalPages) : "");
  const [initialText, setInitialText] = useState(book ? String(book.initialPage) : "0");
  const [status, setStatus] = useState<Extract<BookStatus, "reading" | "want">>("reading");
  const submitted = useRef(false);

  const total = Number(totalText);
  const initial = Number(initialText);
  // Livro novo começa antes da última página; ao editar, a página inicial pode ir até o total.
  const initialOk = book ? initial <= total : initial < total;
  const valid = title.trim() !== "" && Number.isInteger(total) && total > 0 && Number.isInteger(initial) && initial >= 0 && initialOk;

  async function save() {
    if (submitted.current || !valid) return;
    submitted.current = true;
    const fields = { title: title.trim(), author: author.trim() || undefined, totalPages: total, initialPage: initial };
    const result = book
      ? await updateBook(book.id, fields)
      : await addBook({ ...fields, status });
    if (!notify(result, book ? "Livro atualizado" : `“${title.trim()}” adicionado`)) {
      submitted.current = false;
      return;
    }
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
        {book
          ? "Não dá para reduzir o total abaixo da última página que você já registrou como lida."
          : "Se já começou o livro, informe a página em que está. As páginas anteriores não contam como leitura da semana."}
      </p>
      {book ? null : (
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
      )}
      <SheetFooter>
        <Button size="lg" disabled={!valid} onClick={save}>
          {book ? "Salvar alterações" : "Adicionar livro"}
        </Button>
      </SheetFooter>
    </div>
  );
}
