"use client";

import type { ReactNode } from "react";
import { cn } from "cn";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** botões de ação fixos no rodapé, acima da área segura do iPhone */
  footer?: ReactNode;
  /** cor do módulo aplicada ao conteúdo (data-module) */
  module?: string;
  className?: string;
}

/**
 * Rodapé grudado no fim do corpo rolável. Usado por formulários que guardam o próprio estado
 * dentro do sheet (o botão de salvar precisa enxergar os campos).
 */
export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 -mx-4 -mb-4 mt-4 flex flex-col gap-2 border-t bg-popover px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Bottom sheet padrão do app: cabeçalho, corpo rolável e rodapé fixo. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  module,
  className,
}: SheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-module={module}
        className={cn(
          "mx-auto max-w-md data-[vaul-drawer-direction=bottom]:max-h-[92dvh]",
          className,
        )}
      >
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer ? (
          <DrawerFooter className="border-t bg-popover pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </DrawerFooter>
        ) : (
          <div className="pb-safe" />
        )}
      </DrawerContent>
    </Drawer>
  );
}
