"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { KEYBOARD_EVENT, revealFocusedField } from "@/lib/keyboard";

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
      data-sheet-footer
      className={cn(
        "sticky bottom-0 -mx-4 -mb-4 mt-4 flex flex-col gap-2 border-t bg-popover px-4 pt-3 pb-[max(1rem,var(--safe-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Corpo rolável. Com o teclado aberto o sheet encolhe para a parte visível da tela (ver `.sheet-content` em
 * globals.css); aqui garantimos que o campo que está sendo digitado, e o rótulo dele, apareçam dentro dessa área
 * (nem abaixo do teclado, nem atrás do botão de salvar), tanto ao focar um campo quanto quando o teclado abre depois.
 *
 * Enquanto o teclado está aberto, arrastar o corpo só rola o formulário: ao chegar no começo, puxar mais para baixo
 * fechava o sheet (e o que foi digitado) como se fosse um cancelamento. O vaul respeita `data-vaul-no-drag`.
 */
function SheetBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = ref.current;
    if (!body) return;
    let frame = 0;
    const lockDrag = () => body.toggleAttribute("data-vaul-no-drag", document.documentElement.hasAttribute("data-keyboard"));
    lockDrag();
    // Dois quadros: o primeiro aplica o novo tamanho do sheet, o segundo mede já com ele.
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => revealFocusedField(body));
      });
    };
    const onKeyboard = () => {
      lockDrag();
      reveal();
    };
    body.addEventListener("focusin", reveal);
    window.addEventListener(KEYBOARD_EVENT, onKeyboard);
    return () => {
      cancelAnimationFrame(frame);
      body.removeEventListener("focusin", reveal);
      window.removeEventListener(KEYBOARD_EVENT, onKeyboard);
    };
  }, []);

  return (
    <div ref={ref} data-sheet-body className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
    // `repositionInputs={false}`: o vaul tem uma lógica própria de altura/`bottom` para o teclado, que se perdia
    // (sheet atrás do teclado). Quem cuida disso agora é o `KeyboardInsetSync` + `.sheet-content`.
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent data-module={module} className={cn("sheet-content mx-auto max-w-md", className)}>
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
        </DrawerHeader>
        <SheetBody>{children}</SheetBody>
        {footer ? (
          <DrawerFooter className="border-t bg-popover pb-[max(1rem,var(--safe-bottom))]">
            {footer}
          </DrawerFooter>
        ) : (
          <div className="pb-safe" />
        )}
      </DrawerContent>
    </Drawer>
  );
}
