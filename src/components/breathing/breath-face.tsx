"use client";

import type { CSSProperties } from "react";

/**
 * O personagem: uma bolinha de luz com um rosto simples, que respira com você.
 *
 * Parada, ela boia de leve, pisca de vez em quando e sorri de olhos abertos. Ao começar, fecha os olhos durante o
 * "Prepare-se". Na inspiração incha (esticando um pouquinho para cima), acende por dentro, as bochechas coram e a boca
 * se aperta; na retenção fica cheia e parada; na expiração faz um "o", solta baforadas de ar e murcha (achatando um
 * pouquinho). Ao parar, abre os olhos de novo.
 *
 * Nada aqui tem estado nem relógio: tamanho, luz, olhos, bochechas e boca saem das variáveis CSS (`--breath`,
 * `--inflow`, `--outflow`, `--presence`, `--wave-*`) que o relógio da sessão escreve no elemento raiz. Ver breathing.css.
 */

/** baforadas da expiração: defasadas no tempo (--i) e espalhadas para os lados (--dx) */
const PUFFS = [
  { "--i": 0, "--dx": "-0.9em" } as CSSProperties,
  { "--i": 1, "--dx": "0.15em" } as CSSProperties,
  { "--i": 2, "--dx": "1em" } as CSSProperties,
];

interface BreathFaceProps {
  running: boolean;
  onToggle: () => void;
}

export function BreathFace({ running, onToggle }: BreathFaceProps) {
  return (
    <button
      type="button"
      className="breather"
      onClick={onToggle}
      aria-label={running ? "Parar respiração guiada" : "Começar respiração guiada"}
    >
      <span className="breather-glow" aria-hidden="true">
        <span className="breather-halo" />
        <span className="breather-orbit breather-orbit-1" />
        <span className="breather-orbit breather-orbit-2" />
        <span className="breather-orbit breather-orbit-3" />
      </span>
      <span className="breather-float" aria-hidden="true">
        <span className="breather-orb">
          <span className="breather-light" />
          <span className="breather-face">
            <span className="breather-eye" data-side="l">
              <span className="breather-eye-open" />
              <span className="breather-eye-closed" />
            </span>
            <span className="breather-eye" data-side="r">
              <span className="breather-eye-open" />
              <span className="breather-eye-closed" />
            </span>
            <span className="breather-cheek" data-side="l" />
            <span className="breather-cheek" data-side="r" />
            <span className="breather-mouth">
              <span className="breather-smile" />
              <span className="breather-o" />
            </span>
            <span className="breather-puffs">
              {PUFFS.map((style, i) => (
                <span key={i} className="breather-puff" style={style} />
              ))}
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}
