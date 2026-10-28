"use client";

import { useEffect, useRef, useState } from "react";
import {
  breathFlow,
  breathFrame,
  phaseSecondsLeft,
  presenceAt,
  settle,
  SETTLE_MS,
  type BreathPattern,
  type BreathPhaseKind,
} from "@/domain/breathing";

/** O que a tela anima a cada quadro. Tudo 0..1, tudo derivado do mesmo instante. */
export interface BreathValues {
  /** ar no pulmão: 0 vazio (bolinha murcha), 1 cheio */
  breath: number;
  /** ar entrando / saindo agora: 0 nas viradas, 1 no meio da fase (a boca abre com a saída) */
  inflow: number;
  outflow: number;
  /** intensidade da sessão (luz, halo, som): sobe na preparação, desce ao parar */
  presence: number;
  /** a mesma respiração, um pouco atrasada, para as órbitas (a onda que se propaga para fora) */
  waves: readonly [number, number, number];
}

/** O que muda em texto, poucas vezes por segundo (o React só renderiza nessas mudanças). */
export type BreathGuide =
  | { status: "idle"; reason: "initial" | "user" | "hidden" }
  | {
      status: "running";
      phase: BreathPhaseKind | "lead-in";
      /** muda a cada fase, inclusive entre duas inspirações seguidas */
      phaseKey: string;
      /** segundos que faltam na fase; null na preparação */
      seconds: number | null;
    };

export const REST: BreathValues = { breath: 0, inflow: 0, outflow: 0, presence: 0, waves: [0, 0, 0] };

/** Atraso de cada órbita em relação ao personagem: a de dentro responde primeiro. */
const WAVE_LAG_MS = [160, 380, 640] as const;

interface ClockOutput {
  values(values: BreathValues): void;
  guide(guide: BreathGuide): void;
}

/**
 * O relógio da sessão, sem React. Um único `requestAnimationFrame` lê `performance.now()` e pergunta ao domínio onde a
 * respiração está; nada é acumulado entre quadros, então personagem, barra, rótulo e som nunca se descolam.
 */
type BreathClock = ReturnType<typeof createBreathClock>;

function createBreathClock(out: ClockOutput) {
  let pattern: BreathPattern | null = null;
  let startedAt = 0;
  /** de onde o personagem está voltando ao repouso (depois de parar) */
  let stopped: { at: number; from: BreathValues } | null = null;
  let current: BreathValues = REST;
  let frameId = 0;
  let lastGuide = "";

  function emit(guide: BreathGuide, key: string) {
    if (key === lastGuide) return;
    lastGuide = key;
    out.guide(guide);
  }

  /** O que ainda resta da sessão anterior enquanto o personagem se assenta (0 depois de `SETTLE_MS`). */
  function residual(now: number): BreathValues {
    if (!stopped) return REST;
    const since = now - stopped.at;
    if (since >= SETTLE_MS) {
      stopped = null;
      return REST;
    }
    const { from } = stopped;
    return {
      breath: settle(from.breath, since),
      inflow: settle(from.inflow, since),
      outflow: settle(from.outflow, since),
      presence: settle(from.presence, since),
      waves: [settle(from.waves[0], since), settle(from.waves[1], since), settle(from.waves[2], since)],
    };
  }

  function tick(now: number) {
    frameId = 0;
    const rest = residual(now);
    if (pattern) {
      const elapsed = now - startedAt;
      const frame = breathFrame(pattern, elapsed);
      const flow = breathFlow(frame);
      const wave = (i: 0 | 1 | 2) => Math.max(breathFrame(pattern!, elapsed - WAVE_LAG_MS[i]).level, rest.waves[i]);
      // Recomeçar logo depois de parar não dá salto: durante a preparação o personagem termina de se assentar.
      current = {
        breath: Math.max(frame.level, rest.breath),
        inflow: Math.max(flow.inflow, rest.inflow),
        outflow: Math.max(flow.outflow, rest.outflow),
        presence: Math.max(presenceAt(elapsed), rest.presence),
        waves: [wave(0), wave(1), wave(2)],
      };
      out.values(current);
      if (frame.stage === "lead-in") {
        emit({ status: "running", phase: "lead-in", phaseKey: "lead-in", seconds: null }, "lead-in");
      } else {
        const phaseKey = `${frame.cycle}:${frame.phaseIndex}`;
        const seconds = phaseSecondsLeft(frame);
        emit({ status: "running", phase: frame.phase!, phaseKey, seconds }, `${phaseKey}:${seconds}`);
      }
      frameId = requestAnimationFrame(tick);
      return;
    }
    current = rest;
    out.values(current);
    if (stopped) frameId = requestAnimationFrame(tick);
  }

  return {
    start(next: BreathPattern) {
      pattern = next;
      startedAt = performance.now();
      lastGuide = "";
      if (frameId) cancelAnimationFrame(frameId);
      // Responde no próprio toque; os quadros seguintes vêm do rAF.
      tick(startedAt);
    },
    stop(reason: "user" | "hidden") {
      if (!pattern) return;
      const now = performance.now();
      pattern = null;
      stopped = { at: now, from: current };
      lastGuide = "";
      emit({ status: "idle", reason }, `idle:${reason}`);
      if (!frameId) frameId = requestAnimationFrame(tick);
    },
    dispose() {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      pattern = null;
      stopped = null;
      current = REST;
      lastGuide = "";
    },
  };
}

/**
 * Sessão de respiração: liga o relógio ao ciclo de vida da tela. `onValues` recebe os valores de cada quadro (para
 * escrever variáveis CSS e mexer no som, sem renderizar); `guide` só muda quando muda a fase ou o segundo da contagem.
 * Ir para o segundo plano encerra a sessão, e sair da tela cancela tudo.
 */
export function useBreathSession(onValues: (values: BreathValues) => void) {
  const [guide, setGuide] = useState<BreathGuide>({ status: "idle", reason: "initial" });
  const onValuesRef = useRef(onValues);
  const clockRef = useRef<BreathClock | null>(null);
  const running = guide.status === "running";

  useEffect(() => {
    onValuesRef.current = onValues;
  });

  useEffect(() => {
    const clock = createBreathClock({ values: (values) => onValuesRef.current(values), guide: setGuide });
    clockRef.current = clock;
    return () => {
      clock.dispose();
      clockRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clockRef.current?.stop("hidden");
    };
    const onPageHide = () => clockRef.current?.stop("hidden");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [running]);

  return {
    guide,
    running,
    start: (pattern: BreathPattern) => clockRef.current?.start(pattern),
    stop: () => clockRef.current?.stop("user"),
  };
}
