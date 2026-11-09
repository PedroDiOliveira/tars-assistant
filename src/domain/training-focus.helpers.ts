import { focusAdjustment } from "./training-adjust";
import { rulesProposal } from "./training-proposal";
import type { PriorityGroup, TrainingProfile } from "./types";

/** Só para os testes: gerar com foco e pedir o mesmo foco no ajuste não deve propor nada. */
export function adjustedFocusIsStable(profile: TrainingProfile, priorities: PriorityGroup[]): boolean {
  const proposal = rulesProposal({ ...profile, priorities }, [], "00000000-0000-4000-8000-000000000001", 1);
  return focusAdjustment(proposal, { ...profile, priorities }, [], priorities[0]).changes.length === 0;
}
