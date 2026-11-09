import type {
  BodyRegion,
  HealthScreening,
  PriorityGroup,
  TrainingExperience,
  TrainingGoal,
  TrainingLocation,
  TrainingProfile,
  TrainingSplit,
} from "./types";

/**
 * Respostas do formulário do plano de treino: opções, textos e a regra de consistência. O mesmo arquivo serve à
 * tela (rótulos), ao schema dos comandos e ao banco (os valores aceitos são os mesmos das restrições da migração 17).
 */

export const TRAINING_GOALS: readonly TrainingGoal[] = ["massa", "forca", "saude", "emagrecer"];
export const TRAINING_EXPERIENCES: readonly TrainingExperience[] = ["iniciante", "intermediario", "avancado"];
export const TRAINING_DAYS: readonly TrainingProfile["daysPerWeek"][] = [2, 3, 4, 5, 6];
export const SESSION_MINUTES: readonly TrainingProfile["sessionMinutes"][] = [30, 45, 60, 75];
export const TRAINING_LOCATIONS: readonly TrainingLocation[] = ["academia", "casa-halteres"];
export const BODY_REGIONS: readonly BodyRegion[] = ["ombro", "cotovelo", "punho", "lombar", "quadril", "joelho", "tornozelo"];
export const PRIORITY_GROUPS: readonly PriorityGroup[] = ["peito", "costas", "ombros", "bracos", "pernas", "gluteos"];
export const HEALTH_SCREENINGS: readonly HealthScreening[] = ["liberado", "liberacao-medica", "nao-respondida"];

export const MAX_PRIORITIES = 2;
export const MAX_PROFILE_NOTES = 280;

export const GOAL_LABELS: Record<TrainingGoal, { label: string; hint: string }> = {
  massa: { label: "Ganhar massa", hint: "Músculos maiores" },
  forca: { label: "Ganhar força", hint: "Mais carga nos principais" },
  saude: { label: "Saúde e condicionamento", hint: "Disposição e constância" },
  emagrecer: { label: "Perder gordura", hint: "Depende mais da alimentação" },
};

export const EXPERIENCE_LABELS: Record<TrainingExperience, { label: string; hint: string }> = {
  iniciante: { label: "Comecei agora", hint: "Menos de 6 meses treinando" },
  intermediario: { label: "Já treino", hint: "De 6 meses a 2 anos" },
  avancado: { label: "Treino há bastante tempo", hint: "Mais de 2 anos, com constância" },
};

export const LOCATION_LABELS: Record<TrainingLocation, { label: string; hint: string }> = {
  academia: { label: "Academia", hint: "Aparelhos, polias, barras e halteres" },
  "casa-halteres": { label: "Casa, com halteres", hint: "Halteres e o peso do corpo" },
};

export const REGION_LABELS: Record<BodyRegion, string> = {
  ombro: "Ombro",
  cotovelo: "Cotovelo",
  punho: "Punho",
  lombar: "Lombar",
  quadril: "Quadril",
  joelho: "Joelho",
  tornozelo: "Tornozelo",
};

export const PRIORITY_LABELS: Record<PriorityGroup, string> = {
  peito: "Peito",
  costas: "Costas",
  ombros: "Ombros",
  bracos: "Braços",
  pernas: "Pernas",
  gluteos: "Glúteos",
};

export const TRAINING_SPLITS: readonly TrainingSplit[] = ["corpo-inteiro", "superior-inferior", "superior-inferior-ppl", "empurrar-puxar-pernas", "por-grupo"];

export const SPLIT_LABELS: Record<TrainingSplit, string> = {
  "corpo-inteiro": "Corpo inteiro",
  "superior-inferior": "Superior e inferior",
  "superior-inferior-ppl": "Superior, inferior, empurrar, puxar e pernas",
  "empurrar-puxar-pernas": "Empurrar, puxar e pernas",
  "por-grupo": "Um grupo por treino",
};

/**
 * Triagem de saúde antes do primeiro plano, INSPIRADA no PAR-Q (questionário de prontidão para atividade física).
 * Não é o PAR-Q oficial nem um diagnóstico: qualquer "sim" faz o app recomendar liberação médica antes de começar.
 * As respostas nunca são guardadas: só o resultado (`HealthScreening`).
 */
export const SCREENING_QUESTIONS: readonly string[] = [
  "Algum médico já disse que você tem problema no coração ou pressão alta?",
  "Você sente dor no peito em repouso, no dia a dia ou quando faz esforço?",
  "Nos últimos 12 meses, você perdeu o equilíbrio por tontura ou desmaiou?",
  "Você tem outra doença crônica diagnosticada (como diabetes) ou toma remédio contínuo para alguma?",
  "Você está grávida ou teve bebê há menos de 6 meses?",
];

/** Lista sem repetições, na ordem canônica: duas listas com os mesmos itens viram a mesma lista. */
function canonical<T>(values: readonly T[], order: readonly T[]): T[] {
  const set = new Set(values);
  return order.filter((v) => set.has(v));
}

/**
 * Normaliza as respostas antes de salvar (mesma regra do banco): listas sem repetição e em ordem fixa, texto livre
 * sem espaços sobrando e, sem consentimento de saúde, nenhuma limitação guardada.
 */
export function normalizeProfile(profile: TrainingProfile): TrainingProfile {
  const notes = profile.notes?.trim().replace(/\s+/g, " ");
  const answeredHealth = profile.screening !== "nao-respondida";
  const { healthConsentAt, notes: _notes, ...rest } = profile;
  void _notes;
  return {
    ...rest,
    limitations: answeredHealth ? canonical(profile.limitations, BODY_REGIONS) : [],
    priorities: canonical(profile.priorities, PRIORITY_GROUPS).slice(0, MAX_PRIORITIES),
    ...(answeredHealth && healthConsentAt !== undefined ? { healthConsentAt } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Por que estas respostas não podem ser salvas, ou null. Espelha as restrições da tabela `training_profiles`. */
export function profileError(profile: TrainingProfile): string | null {
  if (profile.screening === "nao-respondida") {
    if (profile.limitations.length > 0) return "Limitações só podem ser guardadas com o seu consentimento.";
    if (profile.healthConsentAt !== undefined) return "Respostas de saúde inconsistentes.";
  } else if (profile.healthConsentAt === undefined) {
    return "Confirme o consentimento antes das perguntas de saúde.";
  }
  if (profile.priorities.length > MAX_PRIORITIES) return `Escolha no máximo ${MAX_PRIORITIES} grupos para priorizar.`;
  if ((profile.notes?.length ?? 0) > MAX_PROFILE_NOTES) return `"Algo mais": no máximo ${MAX_PROFILE_NOTES} caracteres.`;
  return null;
}
