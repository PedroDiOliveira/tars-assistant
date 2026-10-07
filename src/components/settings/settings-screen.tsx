"use client";

import { useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ChevronRight, Download, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Segmented } from "@/components/shared/segmented";
import { SectionTitle } from "@/components/shared/section-title";
import { Surface } from "@/components/shared/surface";
import { SubHeader } from "@/components/layout/sub-header";
import { goalFor } from "@/domain/goals";
import { formatBRL, formatBRLCompact } from "@/domain/money";
import type { Goal, GoalKind } from "@/domain/types";
import { useActions, useData, useDisplayName, useTemplates, useToday } from "@/data";
import { APP_NAME } from "@/lib/constants";
import { monthOf, monthStart, weekStart } from "@/lib/dates";
import { formatDayMonth, formatMinutes } from "@/lib/format";
import { cn } from "cn";

type ThemeChoice = "system" | "light" | "dark";

function SettingsScreenContent() {
  const data = useData();
  const today = useToday();
  const name = useDisplayName();
  const templates = useTemplates();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { deleteTemplate, resetDemo } = useActions();

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState<GoalTarget | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const monthStartKey = monthStart(monthOf(today));
  const weekStartKey = weekStart(today);

  function currentGoal(kind: GoalKind, scopeId: string | null): Goal | null {
    const monthly = kind === "savings" || kind === "category_budget";
    return goalFor(data.goals, kind, scopeId, monthly ? monthStartKey : weekStartKey);
  }

  function openGoal(kind: GoalKind, scopeId: string | null, title: string) {
    setGoalTarget({ kind, scopeId, title, current: currentGoal(kind, scopeId)?.target ?? null });
    setGoalOpen(true);
  }

  function goalRow(
    kind: GoalKind,
    scopeId: string | null,
    label: string,
    format: (target: number) => string,
    sheetTitle: string,
  ) {
    return (
      <GoalRow
        key={`${kind}-${scopeId ?? "geral"}`}
        goal={currentGoal(kind, scopeId)}
        label={label}
        format={format}
        onOpen={() => openGoal(kind, scopeId, sheetTitle)}
      />
    );
  }

  const expenseCategories = data.categories.filter((c) => c.type === "expense");

  return (
    <div data-module="primary" className="pb-10">
      <SubHeader title="Configurações" backHref="/inicio" />

      <div className="space-y-6 px-4 pt-2">
        <Surface className="flex items-center gap-4 p-4">
          <span className="grid size-14 place-items-center rounded-full bg-accent text-xl font-bold text-accent-foreground">
            {name.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="text-lg font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">Conta de demonstração · America/Sao_Paulo · BRL</p>
          </div>
        </Surface>

        <section className="space-y-3">
          <SectionTitle>Aparência</SectionTitle>
          <Segmented<ThemeChoice>
            ariaLabel="Tema"
            value={(theme as ThemeChoice | undefined) ?? "system"}
            onChange={setTheme}
            options={[
              { value: "system", label: "Sistema" },
              { value: "light", label: "Claro" },
              { value: "dark", label: "Escuro" },
            ]}
          />
        </section>

        <section className="space-y-3">
          <SectionTitle hint="Mudar a meta vale daqui para a frente; o passado continua como estava">
            Metas
          </SectionTitle>
          <Surface className="divide-y divide-border/70 overflow-hidden">
            {goalRow("savings", null, "Economia por mês", formatBRLCompact, "Meta de economia mensal")}
            {goalRow("workout_sessions", null, "Treinos por semana", (t) => `${t}`, "Meta semanal de treino")}
            {goalRow("study_minutes", null, "Estudo por semana (geral)", formatMinutes, "Meta semanal de estudo")}
            {goalRow("reading_pages", null, "Leitura por semana", (t) => `${t} págs.`, "Meta semanal de leitura")}
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionTitle hint="Limite mensal de despesa">Orçamento por categoria</SectionTitle>
          <Surface className="divide-y divide-border/70 overflow-hidden">
            {expenseCategories.map((c) =>
              goalRow("category_budget", c.id, c.name, formatBRLCompact, `Limite mensal · ${c.name}`),
            )}
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionTitle hint="Meta semanal por matéria">Estudo por matéria</SectionTitle>
          <Surface className="divide-y divide-border/70 overflow-hidden">
            {data.subjects.map((s) =>
              goalRow("study_minutes", s.id, s.name, formatMinutes, `Meta semanal · ${s.name}`),
            )}
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionTitle hint="Aparecem no topo do novo lançamento">Atalhos de lançamento</SectionTitle>
          {templates.length === 0 ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              Nenhum atalho. Ao lançar um gasto, ative “Salvar como atalho”.
            </p>
          ) : (
            <Surface className="divide-y divide-border/70 overflow-hidden">
              {templates.map((t) => (
                <div key={t.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatBRL(t.amountCents)} · {data.categories.find((c) => c.id === t.categoryId)?.name}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover atalho ${t.label}`}
                    onClick={() => {
                      deleteTemplate(t.id);
                      toast.success("Atalho removido");
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
            </Surface>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle>Dados</SectionTitle>
          <div className="space-y-2">
            <Button variant="outline" size="lg" className="w-full justify-start" disabled>
              <Download aria-hidden /> Exportar dados (JSON) · em breve
            </Button>
            <Button variant="outline" size="lg" className="w-full justify-start" onClick={() => setResetOpen(true)}>
              <RotateCcw aria-hidden /> Resetar dados de demonstração
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle>Conta</SectionTitle>
          <Button variant="secondary" size="lg" className="w-full justify-start" onClick={() => router.push("/login")}>
            <LogOut aria-hidden /> Sair
          </Button>
        </section>

        <p className="px-1 text-center text-xs text-muted-foreground">
          {APP_NAME} · protótipo visual. Os dados de demonstração ficam só neste navegador e não representam
          dados pessoais reais.
        </p>
      </div>

      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Resetar a demonstração?"
        description="Todos os dados de demonstração serão substituídos por um conjunto novo, inclusive treino ou cronômetro em andamento."
        confirmLabel="Resetar"
        destructive
        onConfirm={() => {
          resetDemo();
          toast.success("Dados de demonstração restaurados");
        }}
      />
    </div>
  );
}

interface GoalRowProps {
  goal: Goal | null;
  label: string;
  format: (target: number) => string;
  onOpen: () => void;
}

function GoalRow({ goal, label, format, onOpen }: GoalRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition active:bg-muted/60"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          {goal ? `Vigente desde ${formatDayMonth(goal.validFrom)}` : "Sem meta definida"}
        </p>
      </div>
      <span className={cn("shrink-0 text-sm tabular-nums", goal ? "font-semibold" : "text-muted-foreground")}>
        {goal ? format(goal.target) : "Definir"}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />
    </button>
  );
}

export const SettingsScreen = withStoreGate(SettingsScreenContent);
