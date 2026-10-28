import { describe, expect, it } from "vitest";
import {
  BREATH_PATTERN_IDS,
  BREATH_PATTERNS,
  breathFlow,
  breathFrame,
  cycleMs,
  cyclesPerMinute,
  DEFAULT_BREATH_PATTERN,
  describeRhythm,
  easeBreath,
  isBreathPatternId,
  LEAD_IN_MS,
  phaseSecondsLeft,
  presenceAt,
  settle,
  SETTLE_MS,
} from "./breathing";

const coherent = BREATH_PATTERNS.coherent;
const box = BREATH_PATTERNS.box;
const at = (pattern = coherent, ms: number) => breathFrame(pattern, LEAD_IN_MS + ms);

describe("padrões", () => {
  it("o padrão é a respiração coerente: 5 s + 5 s, seis ciclos por minuto", () => {
    expect(DEFAULT_BREATH_PATTERN).toBe("coherent");
    expect(cycleMs(coherent)).toBe(10_000);
    expect(cyclesPerMinute(coherent)).toBe(6);
    expect(cyclesPerMinute(BREATH_PATTERNS.extended)).toBe(6);
  });

  it("todo padrão começa inspirando, tem expiração e fases de duração positiva", () => {
    for (const id of BREATH_PATTERN_IDS) {
      const pattern = BREATH_PATTERNS[id];
      expect(pattern.id).toBe(id);
      expect(pattern.phases[0].kind, id).toBe("inhale");
      expect(pattern.phases.some((p) => p.kind === "exhale"), id).toBe(true);
      for (const phase of pattern.phases) expect(phase.ms, id).toBeGreaterThan(0);
    }
  });

  it("os ritmos lentos ficam entre 3 e 7 ciclos por minuto", () => {
    for (const id of BREATH_PATTERN_IDS) {
      const cpm = cyclesPerMinute(BREATH_PATTERNS[id]);
      expect(cpm, id).toBeGreaterThanOrEqual(3);
      expect(cpm, id).toBeLessThanOrEqual(7);
    }
  });

  it("padrões com retenção avisam sobre tontura", () => {
    for (const id of BREATH_PATTERN_IDS) {
      const pattern = BREATH_PATTERNS[id];
      const holds = pattern.phases.some((p) => p.kind === "hold-in" || p.kind === "hold-out");
      expect(pattern.note.includes("tontura"), id).toBe(holds);
    }
  });

  it("a descrição do ritmo sai das fases", () => {
    expect(describeRhythm(coherent)).toBe("Inspire 5 s · expire 5 s");
    expect(describeRhythm(BREATH_PATTERNS["478"])).toBe("Inspire 4 s · segure 7 s · expire 8 s");
    expect(describeRhythm({ ...coherent, phases: [{ kind: "inhale", ms: 5500 }, { kind: "exhale", ms: 5500 }] })).toBe(
      "Inspire 5,5 s · expire 5,5 s",
    );
  });

  it("reconhece só ids conhecidos", () => {
    expect(isBreathPatternId("box")).toBe(true);
    for (const value of ["", "Box", "4-7-8", null, 478, undefined, {}]) expect(isBreathPatternId(value)).toBe(false);
  });
});

describe("linha do tempo", () => {
  it("começa pela preparação, com o personagem fechado", () => {
    const frame = breathFrame(coherent, 0);
    expect(frame).toMatchObject({ stage: "lead-in", phase: null, level: 0, remainingMs: LEAD_IN_MS });
    expect(breathFrame(coherent, LEAD_IN_MS - 1).stage).toBe("lead-in");
    expect(breathFrame(coherent, -500).stage).toBe("lead-in");
  });

  it("vira de fase exatamente nas fronteiras", () => {
    expect(at(coherent, 0)).toMatchObject({ stage: "breathing", phase: "inhale", cycle: 0, level: 0 });
    expect(at(coherent, 4999).phase).toBe("inhale");
    expect(at(coherent, 5000)).toMatchObject({ phase: "exhale", level: 1 });
    expect(at(coherent, 9999).phase).toBe("exhale");
    expect(at(coherent, 10_000)).toMatchObject({ phase: "inhale", cycle: 1, level: 0 });
  });

  it("segue as quatro fases da caixa, com a barra parada nas retenções", () => {
    expect(at(box, 2000)).toMatchObject({ phase: "inhale", phaseIndex: 0 });
    expect(at(box, 6000)).toMatchObject({ phase: "hold-in", phaseIndex: 1, level: 1 });
    expect(at(box, 7999).level).toBe(1);
    expect(at(box, 10_000)).toMatchObject({ phase: "exhale", phaseIndex: 2 });
    expect(at(box, 14_000)).toMatchObject({ phase: "hold-out", phaseIndex: 3, level: 0 });
    expect(at(box, 16_000)).toMatchObject({ phase: "inhale", cycle: 1 });
  });

  it("no meio da inspiração o pulmão está pela metade", () => {
    expect(at(coherent, 2500).level).toBeCloseTo(0.5, 10);
    expect(at(coherent, 7500).level).toBeCloseTo(0.5, 10);
  });

  it("não deriva: o ciclo mil cai no mesmo lugar do primeiro", () => {
    const first = at(coherent, 1234);
    const later = at(coherent, 1000 * cycleMs(coherent) + 1234);
    expect(later.cycle).toBe(1000);
    expect(later.phase).toBe(first.phase);
    expect(later.level).toBeCloseTo(first.level, 9);
  });

  it("o nível nunca salta: nenhuma mudança brusca em nenhum padrão", () => {
    for (const id of BREATH_PATTERN_IDS) {
      const pattern = BREATH_PATTERNS[id];
      let previous = breathFrame(pattern, 0).level;
      let biggest = 0;
      let lowest = previous;
      let highest = previous;
      for (let ms = 1; ms <= LEAD_IN_MS + 2 * cycleMs(pattern); ms += 1) {
        const level = breathFrame(pattern, ms).level;
        biggest = Math.max(biggest, Math.abs(level - previous));
        lowest = Math.min(lowest, level);
        highest = Math.max(highest, level);
        previous = level;
      }
      expect(lowest, id).toBe(0);
      expect(highest, id).toBe(1);
      // Em 1 ms, a variação máxima de uma curva senoidal de 4 s é π/2/4000 ≈ 0,0004.
      expect(biggest, id).toBeLessThan(0.001);
    }
  });

  it("a contagem mostra os segundos inteiros que faltam", () => {
    expect(phaseSecondsLeft(at(coherent, 0))).toBe(5);
    expect(phaseSecondsLeft(at(coherent, 999))).toBe(5);
    expect(phaseSecondsLeft(at(coherent, 1000))).toBe(4);
    expect(phaseSecondsLeft(at(coherent, 4999))).toBe(1);
    expect(phaseSecondsLeft(at(BREATH_PATTERNS["478"], 4000))).toBe(7);
  });
});

describe("curvas", () => {
  it("ease-in-out simétrica, limitada a 0..1", () => {
    expect(easeBreath(0)).toBe(0);
    expect(easeBreath(1)).toBe(1);
    expect(easeBreath(0.5)).toBeCloseTo(0.5, 10);
    expect(easeBreath(0.25) + easeBreath(0.75)).toBeCloseTo(1, 10);
    expect(easeBreath(-1)).toBe(0);
    expect(easeBreath(2)).toBe(1);
  });

  it("a presença sobe durante a preparação e fica em 1", () => {
    expect(presenceAt(0)).toBe(0);
    expect(presenceAt(LEAD_IN_MS / 2)).toBeCloseTo(0.5, 10);
    expect(presenceAt(LEAD_IN_MS)).toBe(1);
    expect(presenceAt(LEAD_IN_MS * 10)).toBe(1);
  });

  it("ao parar, volta ao repouso a partir de onde estava", () => {
    expect(settle(0.8, 0)).toBe(0.8);
    expect(settle(0.8, SETTLE_MS / 2)).toBeCloseTo(0.4, 10);
    expect(settle(0.8, SETTLE_MS)).toBe(0);
    expect(settle(0.8, SETTLE_MS * 3)).toBe(0);
  });
});

describe("fluxo de ar (a boca do rosto)", () => {
  it("o ar entra na inspiração e sai na expiração, mais forte no meio da fase", () => {
    expect(breathFlow(at(coherent, 2500))).toEqual({ inflow: 1, outflow: 0 });
    const out = breathFlow(at(coherent, 7500));
    expect(out.inflow).toBe(0);
    expect(out.outflow).toBeCloseTo(1, 10);
  });

  it("vale 0 nas viradas, nas retenções e na preparação", () => {
    expect(breathFlow(at(coherent, 0))).toEqual({ inflow: 0, outflow: 0 });
    expect(breathFlow(breathFrame(coherent, LEAD_IN_MS / 2))).toEqual({ inflow: 0, outflow: 0 });
    expect(breathFlow(at(box, 6000))).toEqual({ inflow: 0, outflow: 0 });
    expect(breathFlow(at(box, 14000))).toEqual({ inflow: 0, outflow: 0 });
    const end = breathFlow(at(coherent, 9999));
    expect(end.outflow).toBeLessThan(0.001);
  });

  it("acompanha a velocidade da curva do pulmão (é a derivada dela, normalizada)", () => {
    for (const ms of [500, 1300, 2500, 3700, 4600]) {
      const derivative = (at(coherent, ms + 0.5).level - at(coherent, ms - 0.5).level) / (Math.PI / 2 / 5000);
      expect(breathFlow(at(coherent, ms)).inflow, String(ms)).toBeCloseTo(derivative, 4);
    }
  });
});
