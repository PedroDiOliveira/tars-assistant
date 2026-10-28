/**
 * Respiração guiada: os padrões e a linha do tempo de uma sessão, sem nada de tela.
 *
 * Tudo o que a tela mostra (o personagem que abre e fecha, a barra, o rótulo da fase, a contagem e o som) sai de
 * `breathFrame(padrão, ms desde o toque)`. Uma função pura do relógio, então nada acumula erro: a tela lê
 * `performance.now()` a cada quadro e pergunta "onde estamos?", em vez de somar intervalos de timer.
 *
 * Para mudar um ritmo, basta mexer nas durações de `BREATH_PATTERNS` (em ms). Rótulos, descrição do ritmo, contagem e
 * animação se ajustam sozinhos.
 */

export type BreathPhaseKind = "inhale" | "hold-in" | "exhale" | "hold-out";

export interface BreathPhase {
  readonly kind: BreathPhaseKind;
  readonly ms: number;
}

export type BreathPatternId = "coherent" | "extended" | "box" | "478";

export interface BreathPattern {
  readonly id: BreathPatternId;
  /** nome curto, cabe num segmento do seletor */
  readonly name: string;
  /** uma frase sobre para que serve (sem números: os números saem das fases) */
  readonly note: string;
  readonly phases: readonly BreathPhase[];
}

const s = (seconds: number) => seconds * 1000;

/**
 * Os quatro padrões oferecidos. Escolhas e fontes em docs/decisoes.md ("Respiração guiada").
 *  - coerente (padrão): 5 s + 5 s, 6 ciclos por minuto, a frequência de ressonância média (~0,1 Hz), a mais estudada;
 *  - suave: expiração mais longa que a inspiração, também 6 por minuto;
 *  - caixa e 4-7-8: com retenções, evidência menor; ficam como opção, nunca como padrão.
 */
export const BREATH_PATTERNS: Record<BreathPatternId, BreathPattern> = {
  coherent: {
    id: "coherent",
    name: "Coerente",
    note: "Ritmo ressonante, o mais estudado para relaxar.",
    phases: [
      { kind: "inhale", ms: s(5) },
      { kind: "exhale", ms: s(5) },
    ],
  },
  extended: {
    id: "extended",
    name: "Suave",
    note: "A expiração mais longa ajuda a desacelerar.",
    phases: [
      { kind: "inhale", ms: s(4) },
      { kind: "exhale", ms: s(6) },
    ],
  },
  box: {
    id: "box",
    name: "Caixa",
    note: "Ritmo constante, com pausas. Se sentir tontura, volte a respirar normalmente.",
    phases: [
      { kind: "inhale", ms: s(4) },
      { kind: "hold-in", ms: s(4) },
      { kind: "exhale", ms: s(4) },
      { kind: "hold-out", ms: s(4) },
    ],
  },
  "478": {
    id: "478",
    name: "4-7-8",
    note: "Pausas longas. Se sentir tontura, volte a respirar normalmente.",
    phases: [
      { kind: "inhale", ms: s(4) },
      { kind: "hold-in", ms: s(7) },
      { kind: "exhale", ms: s(8) },
    ],
  },
};

/** Ordem do seletor. */
export const BREATH_PATTERN_IDS: readonly BreathPatternId[] = ["coherent", "extended", "box", "478"];

export const DEFAULT_BREATH_PATTERN: BreathPatternId = "coherent";

export function isBreathPatternId(value: unknown): value is BreathPatternId {
  return typeof value === "string" && (BREATH_PATTERN_IDS as readonly string[]).includes(value);
}

/** Preparação antes da primeira inspiração: o personagem "acorda" e a pessoa se acomoda. Sem números na tela. */
export const LEAD_IN_MS = 2500;

/** Ao parar, o personagem volta ao repouso a partir de onde estava, sem salto. */
export const SETTLE_MS = 1200;

export const PHASE_LABELS: Record<BreathPhaseKind, string> = {
  inhale: "Inspire",
  "hold-in": "Segure",
  exhale: "Expire",
  "hold-out": "Segure",
};

export const LEAD_IN_LABEL = "Prepare-se";

/**
 * Ease-in-out senoidal: o volume do pulmão não muda em linha reta, acelera no meio e desacelera nas pontas. A
 * derivada é zero em 0 e em 1, então a virada de uma fase para a outra nunca dá tranco.
 */
export function easeBreath(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return (1 - Math.cos(Math.PI * x)) / 2;
}

export function cycleMs(pattern: BreathPattern): number {
  return pattern.phases.reduce((total, phase) => total + phase.ms, 0);
}

export function cyclesPerMinute(pattern: BreathPattern): number {
  return 60_000 / cycleMs(pattern);
}

const seconds = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "Inspire 4 s · segure 7 s · expire 8 s": sai das próprias fases, então nunca fica desatualizado. */
export function describeRhythm(pattern: BreathPattern): string {
  return pattern.phases
    .map((phase, i) => {
      const label = PHASE_LABELS[phase.kind];
      return `${i === 0 ? label : label.toLowerCase()} ${seconds.format(phase.ms / 1000)} s`;
    })
    .join(" · ");
}

export type BreathStage = "lead-in" | "breathing";

export interface BreathFrame {
  stage: BreathStage;
  /** null durante a preparação */
  phase: BreathPhaseKind | null;
  /** posição da fase dentro do ciclo (-1 na preparação) */
  phaseIndex: number;
  /** ciclos completos até aqui */
  cycle: number;
  /** 0..1 dentro da fase (ou da preparação) */
  phaseProgress: number;
  remainingMs: number;
  /** 0 = pulmão vazio (personagem fechado), 1 = cheio (aberto). Já com a curva aplicada. */
  level: number;
}

/** Onde a sessão está `elapsedMs` depois do toque que a iniciou. */
export function breathFrame(pattern: BreathPattern, elapsedMs: number): BreathFrame {
  const elapsed = Math.max(elapsedMs, 0);
  if (elapsed < LEAD_IN_MS) {
    return {
      stage: "lead-in",
      phase: null,
      phaseIndex: -1,
      cycle: 0,
      phaseProgress: elapsed / LEAD_IN_MS,
      remainingMs: LEAD_IN_MS - elapsed,
      level: 0,
    };
  }

  const length = cycleMs(pattern);
  const t = elapsed - LEAD_IN_MS;
  const cycle = Math.floor(t / length);
  let within = t - cycle * length;
  let index = 0;
  while (index < pattern.phases.length - 1 && within >= pattern.phases[index].ms) {
    within -= pattern.phases[index].ms;
    index += 1;
  }
  const phase = pattern.phases[index];
  const progress = Math.min(within / phase.ms, 1);
  return {
    stage: "breathing",
    phase: phase.kind,
    phaseIndex: index,
    cycle,
    phaseProgress: progress,
    remainingMs: phase.ms - within,
    level: levelFor(phase.kind, progress),
  };
}

function levelFor(kind: BreathPhaseKind, progress: number): number {
  switch (kind) {
    case "inhale":
      return easeBreath(progress);
    case "hold-in":
      return 1;
    case "exhale":
      return 1 - easeBreath(progress);
    case "hold-out":
      return 0;
  }
}

/**
 * Quanto ar está passando agora, 0..1, separado por sentido. É a derivada da curva do pulmão normalizada (a de
 * `easeBreath` é proporcional a `sin(πt)`): 0 nas viradas, 1 no meio da fase. O rosto abre a boca com a saída; nas
 * retenções e na preparação não passa ar.
 */
export function breathFlow(frame: BreathFrame): { inflow: number; outflow: number } {
  if (frame.phase !== "inhale" && frame.phase !== "exhale") return { inflow: 0, outflow: 0 };
  const flow = Math.max(0, Math.sin(Math.PI * frame.phaseProgress));
  return frame.phase === "inhale" ? { inflow: flow, outflow: 0 } : { inflow: 0, outflow: flow };
}

/** Segundos que faltam na fase, para a contagem discreta (5, 4, 3, 2, 1). */
export function phaseSecondsLeft(frame: BreathFrame): number {
  return Math.max(1, Math.ceil(frame.remainingMs / 1000 - 1e-9));
}

/** Intensidade da sessão (luz, halo, som): sobe durante a preparação e fica em 1. */
export function presenceAt(elapsedMs: number): number {
  return easeBreath(elapsedMs / LEAD_IN_MS);
}

/** Valor que sai de `from` e chega a 0 em `SETTLE_MS`, com a mesma curva da respiração. */
export function settle(from: number, msSinceStop: number): number {
  return from * (1 - easeBreath(msSinceStop / SETTLE_MS));
}
