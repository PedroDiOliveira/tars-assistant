import type { ReactNode } from "react";
import { cn } from "cn";

interface SectionTitleProps {
  children: ReactNode;
  /** texto secundário, ex.: período ("Outubro de 2026") */
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionTitle({ children, hint, action, className }: SectionTitleProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3 px-1", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{children}</h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
