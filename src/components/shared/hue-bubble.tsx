import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

interface HueBubbleProps {
  hue: number;
  icon: LucideIcon;
  className?: string;
}

/** Ícone redondo colorido por matiz (categorias e matérias), com contraste nos dois temas. */
export function HueBubble({ hue, icon: Icon, className }: HueBubbleProps) {
  return (
    <span
      style={{ "--h": hue } as CSSProperties}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full",
        "bg-[oklch(0.94_0.05_var(--h))] text-[oklch(0.42_0.13_var(--h))]",
        "dark:bg-[oklch(0.32_0.07_var(--h))] dark:text-[oklch(0.86_0.11_var(--h))]",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

export function HueDot({ hue, className }: { hue: number; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ "--h": hue } as CSSProperties}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full bg-[oklch(0.7_0.14_var(--h))] dark:bg-[oklch(0.76_0.13_var(--h))]",
        className,
      )}
    />
  );
}
