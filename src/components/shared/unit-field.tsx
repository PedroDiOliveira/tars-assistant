"use client";

import { cn } from "cn";
import { Input } from "@/components/ui/input";

interface UnitFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** unidade sempre visível à direita ("km", "L") */
  unit: string;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Campo numérico com unidade fixa. Teclado decimal no celular, unidade sempre visível e NENHUM filtro de caracteres:
 * o que a pessoa digita fica como está e é validado por quem usa o campo (vírgula ou ponto), em vez de ser "limpo"
 * em silêncio (apagar a vírgula de "12,5" daria 125).
 */
export function UnitField({ id, value, onChange, unit, invalid, describedBy, placeholder, className }: UnitFieldProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={12}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-14 pr-14 text-right text-2xl font-semibold tabular-nums", className)}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-lg font-medium text-muted-foreground"
      >
        {unit}
      </span>
    </div>
  );
}
