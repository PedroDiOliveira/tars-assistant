import { cn } from "cn";
import { ASSISTANT } from "@/lib/constants";
import { LogoMark } from "./logo";

/**
 * O rosto do assistente: a marca do app (as 4 lâminas) num círculo. Mesma identidade do logo, sem criar um personagem
 * novo; aparece onde o assistente "fala" (chat, recado do plano, sugestões).
 */
export function AssistantAvatar({ size = "sm", className }: { size?: "xs" | "sm" | "md"; className?: string }) {
  const sizes = { xs: "size-5 [&_svg]:size-3.5", sm: "size-7 [&_svg]:size-4.5", md: "size-9 [&_svg]:size-6" } as const;
  return (
    <span
      role="img"
      aria-label={ASSISTANT.name}
      className={cn("inline-grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground", sizes[size], className)}
    >
      <LogoMark />
    </span>
  );
}
