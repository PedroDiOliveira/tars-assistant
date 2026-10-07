"use client";

import { useState } from "react";
import { cn } from "cn";
import { formatNumber } from "@/lib/format";

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  /** permite vírgula/ponto decimal (carga em kg) */
  decimal?: boolean;
  label: string;
  className?: string;
  disabled?: boolean;
}

function show(value: number, decimal: boolean): string {
  return decimal ? formatNumber(value, 2) : String(value);
}

/**
 * Campo numérico que aceita digitação parcial ("62," ou vazio) sem brigar com o valor salvo:
 * enquanto está em foco mostra o texto digitado; fora de foco mostra o valor do estado.
 */
export function NumberField({ value, onChange, decimal = false, label, className, disabled }: NumberFieldProps) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);

  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      aria-label={label}
      disabled={disabled}
      value={editing ? text : show(value, decimal)}
      onFocus={(e) => {
        setText(value === 0 ? "" : show(value, decimal).replace(/\./g, ""));
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        const cleaned = decimal ? raw.replace(/[^\d.,]/g, "") : raw.replace(/\D/g, "");
        setText(cleaned);
        const parsed = Number(cleaned.replace(",", "."));
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      onBlur={() => setEditing(false)}
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-background text-center text-base font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
        className,
      )}
    />
  );
}
