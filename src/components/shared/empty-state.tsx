import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** botão ou link com a ação evidente para começar */
  action?: ReactNode;
  className?: string;
}

/** Tela vazia útil: explica o que falta e oferece a primeira ação. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full bg-m-soft text-m-ink">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
