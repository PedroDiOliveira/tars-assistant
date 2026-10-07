"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import type { Category, TxType } from "@/domain/types";
import { cn } from "cn";

export type TypeFilter = TxType | "all";

export interface Filters {
  type: TypeFilter;
  categoryId: string;
  query: string;
}

export const EMPTY_FILTERS: Filters = { type: "all", categoryId: "all", query: "" };

export function countActiveFilters(filters: Filters): number {
  return (
    (filters.type !== "all" ? 1 : 0) +
    (filters.categoryId !== "all" ? 1 : 0) +
    (filters.query.trim() !== "" ? 1 : 0)
  );
}

interface FiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: Category[];
}

/** Filtros fora da tela principal: só aparecem quando você pede. */
export function FiltersSheet({ open, onOpenChange, filters, onChange, categories }: FiltersSheetProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Filtrar lançamentos" module="finance">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Tipo</p>
          <Segmented<TypeFilter>
            ariaLabel="Filtrar por tipo"
            value={filters.type}
            onChange={(type) => set({ type })}
            options={[
              { value: "all", label: "Todos" },
              { value: "income", label: "Receitas" },
              { value: "expense", label: "Despesas" },
            ]}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Categoria</p>
          <div className="flex flex-wrap gap-2">
            {[{ id: "all", name: "Todas" }, ...categories].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filters.categoryId === c.id}
                onClick={() => set({ categoryId: c.id })}
                className={cn(
                  "min-h-11 rounded-full border px-3.5 text-sm font-medium transition",
                  filters.categoryId === c.id
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "bg-card active:bg-muted",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Buscar na descrição</span>
          <Input
            type="search"
            value={filters.query}
            placeholder="Ex.: mercado"
            onChange={(e) => set({ query: e.target.value })}
          />
        </label>

        <SheetFooter>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Ver resultados
          </Button>
          <Button variant="ghost" size="lg" onClick={() => onChange(EMPTY_FILTERS)}>
            Limpar filtros
          </Button>
        </SheetFooter>
      </div>
    </Sheet>
  );
}
