import { EMPTY_APP_DATA, type AppData } from "@/domain/snapshot";
import type { ChatRequest, ChatResult, LlmProvider, ToolCall } from "./provider";

export const TODAY = "2026-10-07"; // quarta-feira; a semana começa em 2026-10-05

/** Conta de teste com números fáceis de conferir à mão. */
export function sampleData(over: Partial<AppData> = {}): AppData {
  return {
    ...EMPTY_APP_DATA,
    categories: [
      { id: "c-food", name: "Alimentação", type: "expense", icon: "utensils", hue: 100 },
      { id: "c-transport", name: "Transporte", type: "expense", icon: "car", hue: 120 },
      { id: "c-other", name: "Outros", type: "expense", icon: "dots", hue: 140 },
      { id: "c-old", name: "Antiga", type: "expense", icon: "dots", hue: 150, archived: true },
      { id: "c-salary", name: "Salário", type: "income", icon: "wage", hue: 160 },
      { id: "c-income-other", name: "Outros", type: "income", icon: "plus", hue: 170 },
    ],
    transactions: [
      { id: "t1", type: "income", amountCents: 350_000, categoryId: "c-salary", description: "Salário", occurredOn: "2026-10-05", source: "manual" },
      { id: "t2", type: "expense", amountCents: 4_200, categoryId: "c-food", description: "Outback", occurredOn: "2026-10-06", source: "manual" },
      { id: "t3", type: "expense", amountCents: 1_800, categoryId: "c-food", description: "Padaria", occurredOn: "2026-10-02", source: "manual" },
      { id: "t4", type: "expense", amountCents: 2_500, categoryId: "c-transport", description: "Uber", occurredOn: "2026-10-03", source: "manual" },
      { id: "t5", type: "expense", amountCents: 9_900, categoryId: "c-food", description: "Setembro", occurredOn: "2026-09-20", source: "manual" },
    ],
    goals: [
      { id: "g1", kind: "savings", scopeId: null, validFrom: "2026-10-01", target: 100_000 },
      { id: "g2", kind: "category_budget", scopeId: "c-food", validFrom: "2026-10-01", target: 20_000 },
    ],
    subjects: [
      { id: "s-sql", name: "SQL", hue: 120 },
      { id: "s-pt", name: "Português", hue: 130 },
    ],
    studySessions: [
      { id: "ss1", subjectId: "s-sql", source: "manual", occurredOn: "2026-10-06", durationSeconds: 3_600 },
      { id: "ss2", subjectId: "s-sql", source: "timer", occurredOn: "2026-10-07", durationSeconds: 1_800 },
      { id: "ss3", subjectId: "s-pt", source: "manual", occurredOn: "2026-10-05", durationSeconds: 900 },
      { id: "ss4", subjectId: "s-sql", source: "manual", occurredOn: "2026-09-01", durationSeconds: 7_200 },
    ],
    books: [{ id: "b1", title: "Livro A", totalPages: 320, initialPage: 30, status: "reading" }],
    readingSessions: [
      { id: "r1", bookId: "b1", occurredOn: "2026-10-06", startPage: 30, endPage: 50 },
      { id: "r2", bookId: "b1", occurredOn: "2026-10-07", startPage: 50, endPage: 65 },
    ],
    sessions: [
      { id: "w1", planId: null, nameSnapshot: "Treino A", startedAt: 1, finishedAt: 2, occurredOn: "2026-10-05", exercises: [] },
      { id: "w2", planId: null, nameSnapshot: "Treino B", startedAt: 3, finishedAt: 4, occurredOn: "2026-10-07", exercises: [] },
      { id: "w3", planId: null, nameSnapshot: "Treino A", startedAt: 5, finishedAt: 6, occurredOn: "2026-09-28", exercises: [] },
    ],
    ...over,
  };
}

export const call = (id: string, name: string, args: unknown): ToolCall => ({ id, name, arguments: typeof args === "string" ? args : JSON.stringify(args) });

export type Step = { content?: string | null; toolCalls?: ToolCall[]; usage?: { inputTokens: number; outputTokens: number } } | ((request: ChatRequest) => ChatResult);

/** Provedor roteirizado: devolve os passos em ordem e guarda tudo o que recebeu. */
export function scripted(steps: Step[]): LlmProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    name: "scripted",
    requests,
    async chat(request) {
      requests.push(structuredClone({ ...request, signal: undefined }) as unknown as ChatRequest);
      const step = steps[requests.length - 1];
      if (!step) throw new Error("o roteiro acabou: o assistente chamou o modelo mais vezes que o esperado");
      if (typeof step === "function") return step(request);
      return {
        message: { content: step.content ?? null, toolCalls: step.toolCalls ?? [] },
        usage: step.usage ?? { inputTokens: 100, outputTokens: 20 },
      };
    },
  };
}
