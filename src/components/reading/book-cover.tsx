import type { CSSProperties } from "react";
import { cn } from "cn";

function hueFor(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 360;
  return hash;
}

/** Capa genérica gerada a partir do título (sem imagens externas). */
export function BookCover({ title, className }: { title: string; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ "--h": hueFor(title) } as CSSProperties}
      className={cn(
        "grid h-16 w-12 shrink-0 place-items-center rounded-md text-lg font-bold",
        "bg-[oklch(0.88_0.08_var(--h))] text-[oklch(0.35_0.12_var(--h))]",
        "dark:bg-[oklch(0.38_0.09_var(--h))] dark:text-[oklch(0.92_0.07_var(--h))]",
        className,
      )}
    >
      {title.trim().charAt(0).toUpperCase()}
    </span>
  );
}
