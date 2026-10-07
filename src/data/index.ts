"use client";

/**
 * Único ponto de acesso a dados para as telas. Há duas fontes com a mesma forma (`DataLayer`):
 *  - `demo`: dados fictícios no navegador (desenvolvimento, previews, testes E2E);
 *  - `remote`: dados reais no Supabase, sempre através do servidor.
 * O modo é fixo por deploy (`NEXT_PUBLIC_APP_MODE`); telas e componentes nunca importam `./demo/*` nem
 * `./remote/*` diretamente.
 */
import { useEffect, useState } from "react";
import { IS_LIVE } from "@/lib/app-mode";
import { todayKey, type DateKey } from "@/lib/dates";
import { demoLayer } from "./demo/layer";
import type { DataLayer } from "./layer";
import { remoteLayer } from "./remote/layer";

export type {
  Actions,
  AssistantApi,
  Failure,
  FinishStudyOutcome,
  FinishWorkoutOutcome,
  Result,
  Success,
} from "./contract";
export type { Account, StoreStatus } from "./layer";
export { acceptAiConsent, useAiConsent } from "./consent";
export { DataProvider } from "./provider";

const layer: DataLayer = IS_LIVE ? remoteLayer : demoLayer;

export const useStoreStatus = layer.useStoreStatus;
export const useLaunchReady = layer.useLaunchReady;
/** Tudo o que o domínio lê para calcular totais, metas e históricos. */
export const useData = layer.useData;
export const useTemplates = layer.useTemplates;
export const useDraft = layer.useDraft;
export const useTimer = layer.useTimer;
export const useAccount = layer.useAccount;
export const signOut = layer.signOut;
export const assistant = layer.assistant;

export function useActions() {
  return layer.actions;
}

/** Nome para exibir (saudação, avatar). */
export function useDisplayName(): string {
  return useAccount().displayName;
}

/** Data de hoje no fuso do app; vira sozinha à meia-noite. */
export function useToday(): DateKey {
  const [today, setToday] = useState<DateKey>(() => todayKey());
  useEffect(() => {
    const timer = setInterval(() => setToday(todayKey()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

/** Relógio que atualiza a cada `intervalMs` (para cronômetros e descanso). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
