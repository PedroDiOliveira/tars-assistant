import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_APP_DATA } from "@/domain/snapshot";
import { CAUTION_BY_REGION, planErrors, SLOT_TYPES } from "@/domain/training-rules";
import type { Exercise, TrainingProfile } from "@/domain/types";
import { parseEnv } from "../env-schema";
import { createPlanProvider } from "./factory";
import { generatePlan } from "./plan";

/**
 * AVALIAÇÃO DO PLANO DE TREINO CONTRA O MODELO REAL. Não roda no `npm test` nem no CI: só com uma chave fornecida por
 * variável de ambiente (que nunca vai para o repositório):
 *
 *   AI_EVAL_PROVIDER=groq AI_EVAL_MODEL=openai/gpt-oss-20b AI_EVAL_KEY=... npx vitest run src/server/ai/plan.eval.live.test.ts
 *
 * Perfis de referência (iniciante em casa, intermediário na academia com dor no joelho, avançado com 6 dias e pouco
 * tempo...). As asserções são sobre o que a IA NÃO pode errar: o plano tem de vir da IA (não do modelo pronto), ser
 * válido pelas regras e ter textos em português dentro do tamanho. O texto exato varia entre modelos. Com AI_EVAL_OUT,
 * cada plano vai para um arquivo (uma linha JSON por perfil) para leitura humana. Os perfis são espaçados porque a
 * camada gratuita da Groq limita tokens por minuto.
 */
const KEY = process.env.AI_EVAL_KEY;
const PROVIDER = (process.env.AI_EVAL_PROVIDER ?? "groq") as "groq" | "xai";
const MODEL = process.env.AI_EVAL_MODEL ?? "openai/gpt-oss-20b";
const PAUSE_MS = Number(process.env.AI_EVAL_PAUSE_MS ?? 30_000);

// Guarda o motivo de cada recusa do provedor (status e começo da mensagem), para o relatório.
let lastError: string | null = null;
const ai = KEY
  ? createPlanProvider(parseEnv({ AI_PROVIDER: PROVIDER, AI_API_KEY: KEY, AI_MODEL: MODEL }), async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) lastError = `${response.status} ${(await response.clone().text()).slice(0, 160)}`;
      return response;
    })
  : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NOW = Date.UTC(2026, 9, 28, 15, 0);

const base: TrainingProfile = {
  goal: "massa",
  experience: "intermediario",
  daysPerWeek: 4,
  sessionMinutes: 60,
  location: "academia",
  limitations: [],
  screening: "liberado",
  healthConsentAt: NOW - 1000,
  priorities: [],
  updatedAt: NOW,
};

const MINE: Exercise[] = [
  { id: "e1", name: "Supino reto", muscleGroup: "Peito", loadType: "external", libraryKey: "supino-reto-barra" },
  { id: "e2", name: "Puxada frontal", muscleGroup: "Costas", loadType: "external", libraryKey: "puxada-frontal" },
  { id: "e3", name: "Leg press", muscleGroup: "Pernas", loadType: "external", libraryKey: "leg-press" },
];

const PROFILES: { name: string; profile: TrainingProfile; exercises: Exercise[] }[] = [
  { name: "intermediário, academia, 4 dias, prioriza costas", profile: { ...base, priorities: ["costas"] }, exercises: MINE },
  { name: "iniciante em casa com halteres, 3 dias de 45 min", profile: { ...base, goal: "saude", experience: "iniciante", daysPerWeek: 3, sessionMinutes: 45, location: "casa-halteres" }, exercises: [] },
  { name: "joelho e lombar doloridos, 4 dias", profile: { ...base, limitations: ["lombar", "joelho"], notes: "Não gosto de máquinas de perna" }, exercises: MINE },
  { name: "força, avançado, 5 dias de 75 min", profile: { ...base, goal: "forca", experience: "avancado", daysPerWeek: 5, sessionMinutes: 75 }, exercises: MINE },
  { name: "6 dias de 30 min, perder gordura", profile: { ...base, goal: "emagrecer", daysPerWeek: 6, sessionMinutes: 30, screening: "nao-respondida", healthConsentAt: undefined }, exercises: [] },
];

describe.skipIf(!ai)(`plano de treino com o modelo real (${MODEL})`, () => {
  it.each(PROFILES)("$name", async ({ name, profile, exercises }) => {
    const started = Date.now();
    lastError = null;
    const result = await generatePlan({
      ai: ai!,
      profile,
      data: { ...EMPTY_APP_DATA, exercises },
      today: "2026-10-28",
      id: "00000000-0000-4000-8000-000000000001",
      nowMs: NOW,
      signal: AbortSignal.timeout(90_000),
    });
    const { proposal } = result;
    if (process.env.AI_EVAL_OUT) {
      const days = proposal.skeleton.days.map((d) => ({
        name: d.name,
        slots: d.slots.map((s) => ({ vaga: SLOT_TYPES[s.type].label, ...proposal.choices[s.id] })),
      }));
      appendFileSync(
        process.env.AI_EVAL_OUT,
        `${JSON.stringify({ model: MODEL, name, source: proposal.source, fallback: proposal.fallback ?? null, error: lastError, attempts: result.attempts, usage: result.usage, ms: Date.now() - started, summary: proposal.summary, days })}\n`,
      );
    }
    await sleep(PAUSE_MS);

    expect(proposal.source, `caiu no modelo pronto: ${proposal.fallback}`).toBe("ai");
    expect(planErrors(proposal.skeleton, proposal.choices)).toEqual([]);
    expect(proposal.summary.length).toBeGreaterThan(40);
    expect(proposal.summary).toMatch(/[ãçéêóúí]/); // português, não inglês
    const keys = Object.values(proposal.choices).map((c) => c.exerciseKey);
    for (const region of profile.limitations) for (const key of keys) expect(CAUTION_BY_REGION[region].has(key)).toBe(false);
    const reasons = Object.values(proposal.choices).filter((c) => c.reason);
    expect(reasons.length).toBeGreaterThan(keys.length / 2);
  });
});
