import type { ComponentProps } from "react";
import { cn } from "cn";

/** Cartão base do app: superfície com borda sutil, sem sombra pesada. */
export function Surface({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-2xl bg-card text-card-foreground ring-1 ring-border/70", className)}
      {...props}
    />
  );
}
