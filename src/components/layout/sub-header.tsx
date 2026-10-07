import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface SubHeaderProps {
  title: string;
  backHref: string;
  backLabel?: string;
  right?: ReactNode;
}

/** Cabeçalho de telas internas (sem barra inferior): voltar + título + ação opcional. */
export function SubHeader({ title, backHref, backLabel = "Voltar", right }: SubHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 bg-background/85 px-2 backdrop-blur-md">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="grid size-11 shrink-0 place-items-center rounded-full transition active:bg-muted"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
