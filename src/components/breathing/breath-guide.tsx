"use client";

import { LEAD_IN_LABEL, PHASE_LABELS } from "@/domain/breathing";
import type { BreathGuide as Guide } from "./use-breath-session";

const HINTS = {
  initial: "Toque para começar",
  user: "Toque para começar",
  hidden: "Pausado. Toque para continuar",
} as const;

/**
 * Rótulo da fase, contagem discreta e a barra. O rótulo é a região `aria-live` (educada): anuncia a troca de fase,
 * nunca cada segundo. A contagem e a barra são só visuais (a informação já está no texto); a barra enche com o
 * mesmo `--breath` que abre o personagem.
 */
export function BreathGuide({ guide }: { guide: Guide }) {
  const running = guide.status === "running";
  const label = running ? (guide.phase === "lead-in" ? LEAD_IN_LABEL : PHASE_LABELS[guide.phase]) : HINTS[guide.reason];
  const seconds = running ? guide.seconds : null;

  return (
    <div className="breath-guide" data-phase={running ? guide.phase : "idle"}>
      <div className="breath-label-row">
        <p className="breath-label" aria-live="polite" aria-atomic="true">
          <span key={running ? guide.phaseKey : `idle:${guide.reason}`} className="breath-label-text">
            {label}
          </span>
        </p>
        <span className="breath-count" aria-hidden="true">
          {seconds ?? ""}
        </span>
      </div>
      <div className="breath-bar" aria-hidden="true">
        <div className="breath-bar-fill" />
      </div>
    </div>
  );
}
