"use client";

/**
 * Único ponto de acesso a dados para as telas. Hoje lê o store mock (localStorage);
 * na fase real, só este arquivo troca para o Supabase. Telas e componentes nunca
 * importam `./mock/*` diretamente.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { todayKey, type DateKey } from "@/lib/dates";
import type { DataSnapshot } from "@/domain/summary";
import type { StudyTimer, TxTemplate, WorkoutDraft } from "@/domain/types";
import { actions, ensureStoreReady, isStoreReady, useTarsStore, type Actions } from "./mock/store";

export type { Actions, FinishStudyResult, FinishWorkoutResult } from "./mock/store";

function subscribeStoreReady(onReady: () => void) {
  let subscribed = true;
  ensureStoreReady().then(
    () => { if (subscribed) onReady(); },
    // StoreGate exposes its recovery UI if initialization fails.
    () => undefined,
  );
  return () => { subscribed = false; };
}

const storeNotReadyOnServer = () => false;

/** true quando os dados locais já foram carregados. Antes disso, mostre um esqueleto. */
export function useStoreReady(): boolean {
  // A streamed page may hydrate after AppLaunch has already initialized the store.
  // Its first hydration render must still match the server's skeleton.
  return useSyncExternalStore(subscribeStoreReady, isStoreReady, storeNotReadyOnServer);
}

/** Tudo o que o domínio lê para calcular totais, metas e históricos. */
export function useData(): DataSnapshot {
  return useTarsStore(
    useShallow((s) => ({
      categories: s.categories,
      transactions: s.transactions,
      goals: s.goals,
      exercises: s.exercises,
      plans: s.plans,
      sessions: s.sessions,
      subjects: s.subjects,
      studySessions: s.studySessions,
      books: s.books,
      readingSessions: s.readingSessions,
    })),
  );
}

export function useTemplates(): TxTemplate[] {
  return useTarsStore((s) => s.templates);
}

export function useDraft(): WorkoutDraft | null {
  return useTarsStore((s) => s.draft);
}

export function useTimer(): StudyTimer | null {
  return useTarsStore((s) => s.timer);
}

export function useDisplayName(): string {
  return useTarsStore((s) => s.displayName);
}

export function useActions(): Actions {
  return actions;
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
