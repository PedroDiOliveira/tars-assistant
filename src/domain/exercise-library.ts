/**
 * Biblioteca de exercícios: uma lista fixa, igual para todo mundo, que vive no código (não no banco).
 *
 * Os exercícios de cada pessoa continuam sendo dela (nome, grupo e tipo de carga editáveis); a biblioteca só dá um
 * ponto de partida ao cadastrar e um VÍNCULO opcional (`Exercise.libraryKey`). O vínculo é o que permite, sem
 * depender do nome digitado, saber o equipamento (passo de carga da progressão), os músculos trabalhados e o padrão de
 * movimento (base para trocar um exercício por outro equivalente e, no futuro, para o plano de treino).
 *
 * As chaves são estáveis: renomear um exercício aqui não quebra nada, mas apagar ou mudar uma chave deixa os vínculos
 * existentes órfãos (o app os trata como "sem vínculo"). Só ACRESCENTE chaves.
 */

/** Grupo exibido no app (vai para o campo "Grupo muscular" do exercício da pessoa). */
export type LibraryGroup = "Peito" | "Costas" | "Ombros" | "Bíceps" | "Tríceps" | "Pernas" | "Glúteos" | "Abdômen";

export type Muscle =
  | "peito"
  | "dorsais"
  | "costas-meio"
  | "lombar"
  | "trapezio"
  | "ombro-frontal"
  | "ombro-lateral"
  | "ombro-posterior"
  | "biceps"
  | "triceps"
  | "antebraco"
  | "quadriceps"
  | "posteriores"
  | "gluteos"
  | "adutores"
  | "panturrilhas"
  | "abdomen";

/** Padrão de movimento: dois exercícios do mesmo padrão e mesmo músculo principal costumam se substituir. */
export type MovementPattern =
  | "empurrar-horizontal"
  | "empurrar-vertical"
  | "puxar-horizontal"
  | "puxar-vertical"
  | "agachar"
  | "quadril"
  | "unilateral-pernas"
  | "isolado"
  | "core";

export type Equipment = "barra" | "halteres" | "maquina" | "polia" | "smith" | "kettlebell" | "peso-corporal";

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barra: "Barra",
  halteres: "Halteres",
  maquina: "Máquina",
  polia: "Polia",
  smith: "Smith",
  kettlebell: "Kettlebell",
  "peso-corporal": "Peso do corpo",
};

export interface LibraryExercise {
  key: string;
  name: string;
  /** outros nomes comuns, para a busca e para reconhecer exercícios já cadastrados */
  aliases?: readonly string[];
  group: LibraryGroup;
  /** o principal primeiro */
  muscles: readonly Muscle[];
  pattern: MovementPattern;
  equipment: Equipment;
  loadType: "external" | "bodyweight";
}

export const LIBRARY_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_LIBRARY_KEY = 60;

const ex = (
  key: string,
  name: string,
  group: LibraryGroup,
  muscles: readonly Muscle[],
  pattern: MovementPattern,
  equipment: Equipment,
  aliases?: readonly string[],
): LibraryExercise => ({
  key,
  name,
  group,
  muscles,
  pattern,
  equipment,
  loadType: equipment === "peso-corporal" ? "bodyweight" : "external",
  ...(aliases ? { aliases } : {}),
});

export const EXERCISE_LIBRARY: readonly LibraryExercise[] = [
  // Peito
  ex("supino-reto-barra", "Supino reto com barra", "Peito", ["peito", "triceps", "ombro-frontal"], "empurrar-horizontal", "barra", ["supino reto", "supino"]),
  ex("supino-reto-halteres", "Supino reto com halteres", "Peito", ["peito", "triceps", "ombro-frontal"], "empurrar-horizontal", "halteres"),
  ex("supino-inclinado-barra", "Supino inclinado com barra", "Peito", ["peito", "ombro-frontal", "triceps"], "empurrar-horizontal", "barra", ["supino inclinado"]),
  ex("supino-inclinado-halteres", "Supino inclinado com halteres", "Peito", ["peito", "ombro-frontal", "triceps"], "empurrar-horizontal", "halteres"),
  ex("supino-declinado", "Supino declinado", "Peito", ["peito", "triceps"], "empurrar-horizontal", "barra"),
  ex("supino-maquina", "Supino na máquina", "Peito", ["peito", "triceps", "ombro-frontal"], "empurrar-horizontal", "maquina", ["chest press", "supino articulado"]),
  ex("supino-smith", "Supino no Smith", "Peito", ["peito", "triceps", "ombro-frontal"], "empurrar-horizontal", "smith", ["supino smith"]),
  ex("crucifixo-halteres", "Crucifixo com halteres", "Peito", ["peito"], "isolado", "halteres", ["crucifixo", "crucifixo reto"]),
  ex("crucifixo-maquina", "Crucifixo na máquina", "Peito", ["peito"], "isolado", "maquina", ["peck deck", "voador"]),
  ex("crossover", "Crossover na polia", "Peito", ["peito"], "isolado", "polia", ["cross over", "crucifixo na polia"]),
  ex("flexao", "Flexão de braço", "Peito", ["peito", "triceps", "ombro-frontal"], "empurrar-horizontal", "peso-corporal", ["flexão"]),
  ex("mergulho-paralelas", "Mergulho nas paralelas", "Peito", ["peito", "triceps", "ombro-frontal"], "empurrar-vertical", "peso-corporal", ["paralelas", "dips"]),

  // Costas
  ex("barra-fixa", "Barra fixa", "Costas", ["dorsais", "biceps", "costas-meio"], "puxar-vertical", "peso-corporal", ["barra fixa pronada", "pull up"]),
  ex("barra-fixa-supinada", "Barra fixa supinada", "Costas", ["dorsais", "biceps"], "puxar-vertical", "peso-corporal", ["chin up"]),
  ex("puxada-frontal", "Puxada frontal", "Costas", ["dorsais", "biceps", "costas-meio"], "puxar-vertical", "polia", ["puxada alta", "puxada aberta", "pulldown"]),
  ex("puxada-triangulo", "Puxada com triângulo", "Costas", ["dorsais", "biceps"], "puxar-vertical", "polia", ["puxada fechada"]),
  ex("remada-curvada", "Remada curvada com barra", "Costas", ["costas-meio", "dorsais", "biceps"], "puxar-horizontal", "barra", ["remada curvada"]),
  ex("remada-unilateral", "Remada unilateral com halter", "Costas", ["dorsais", "costas-meio", "biceps"], "puxar-horizontal", "halteres", ["remada serrote", "serrote", "remada unilateral"]),
  ex("remada-baixa", "Remada baixa na polia", "Costas", ["costas-meio", "dorsais", "biceps"], "puxar-horizontal", "polia", ["remada baixa", "remada sentada"]),
  ex("remada-maquina", "Remada na máquina", "Costas", ["costas-meio", "dorsais", "biceps"], "puxar-horizontal", "maquina", ["remada articulada"]),
  ex("remada-cavalinho", "Remada cavalinho", "Costas", ["costas-meio", "dorsais"], "puxar-horizontal", "barra", ["remada t", "remada no cavalinho"]),
  ex("remada-curvada-halteres", "Remada curvada com halteres", "Costas", ["costas-meio", "dorsais", "biceps"], "puxar-horizontal", "halteres"),
  ex("pullover-halteres", "Pullover com halter", "Costas", ["dorsais", "peito"], "isolado", "halteres", ["pullover"]),
  ex("pulldown-bracos-estendidos", "Pulldown com braços estendidos", "Costas", ["dorsais"], "isolado", "polia", ["pullover na polia", "pulldown braço estendido"]),
  ex("levantamento-terra", "Levantamento terra", "Costas", ["posteriores", "gluteos", "lombar", "costas-meio"], "quadril", "barra", ["terra", "deadlift"]),
  ex("hiperextensao-lombar", "Hiperextensão lombar", "Costas", ["lombar", "gluteos", "posteriores"], "quadril", "peso-corporal", ["extensão lombar", "banco romano"]),

  // Ombros
  ex("desenvolvimento-halteres", "Desenvolvimento com halteres", "Ombros", ["ombro-frontal", "ombro-lateral", "triceps"], "empurrar-vertical", "halteres", ["desenvolvimento"]),
  ex("desenvolvimento-barra", "Desenvolvimento com barra", "Ombros", ["ombro-frontal", "ombro-lateral", "triceps"], "empurrar-vertical", "barra", ["desenvolvimento militar", "press militar"]),
  ex("desenvolvimento-maquina", "Desenvolvimento na máquina", "Ombros", ["ombro-frontal", "ombro-lateral", "triceps"], "empurrar-vertical", "maquina"),
  ex("elevacao-lateral", "Elevação lateral com halteres", "Ombros", ["ombro-lateral"], "isolado", "halteres", ["elevação lateral"]),
  ex("elevacao-lateral-polia", "Elevação lateral na polia", "Ombros", ["ombro-lateral"], "isolado", "polia"),
  ex("elevacao-frontal", "Elevação frontal", "Ombros", ["ombro-frontal"], "isolado", "halteres"),
  ex("crucifixo-inverso", "Crucifixo inverso", "Ombros", ["ombro-posterior", "costas-meio"], "isolado", "maquina", ["crucifixo invertido", "voador invertido", "peck deck invertido"]),
  ex("face-pull", "Face pull na polia", "Ombros", ["ombro-posterior", "costas-meio", "trapezio"], "puxar-horizontal", "polia", ["face pull"]),
  ex("remada-alta", "Remada alta", "Ombros", ["ombro-lateral", "trapezio"], "puxar-vertical", "barra"),
  ex("encolhimento", "Encolhimento com halteres", "Ombros", ["trapezio"], "isolado", "halteres", ["encolhimento"]),

  // Bíceps
  ex("rosca-direta", "Rosca direta com barra", "Bíceps", ["biceps", "antebraco"], "isolado", "barra", ["rosca direta"]),
  ex("rosca-alternada", "Rosca alternada com halteres", "Bíceps", ["biceps", "antebraco"], "isolado", "halteres", ["rosca alternada"]),
  ex("rosca-martelo", "Rosca martelo", "Bíceps", ["biceps", "antebraco"], "isolado", "halteres"),
  ex("rosca-scott", "Rosca Scott", "Bíceps", ["biceps"], "isolado", "barra"),
  ex("rosca-concentrada", "Rosca concentrada", "Bíceps", ["biceps"], "isolado", "halteres"),
  ex("rosca-polia", "Rosca na polia", "Bíceps", ["biceps"], "isolado", "polia"),
  ex("rosca-inclinada", "Rosca inclinada com halteres", "Bíceps", ["biceps"], "isolado", "halteres"),

  // Tríceps
  ex("triceps-pulley", "Tríceps pulley", "Tríceps", ["triceps"], "isolado", "polia", ["tríceps na polia", "tríceps barra"]),
  ex("triceps-corda", "Tríceps corda", "Tríceps", ["triceps"], "isolado", "polia", ["tríceps na corda"]),
  ex("triceps-testa", "Tríceps testa", "Tríceps", ["triceps"], "isolado", "barra"),
  ex("triceps-frances", "Tríceps francês", "Tríceps", ["triceps"], "isolado", "halteres", ["tríceps francês com halter"]),
  ex("triceps-coice", "Tríceps coice", "Tríceps", ["triceps"], "isolado", "halteres", ["coice"]),
  ex("supino-fechado", "Supino fechado", "Tríceps", ["triceps", "peito"], "empurrar-horizontal", "barra", ["supino pegada fechada"]),
  ex("mergulho-banco", "Mergulho no banco", "Tríceps", ["triceps"], "empurrar-vertical", "peso-corporal", ["tríceps banco"]),

  // Pernas
  ex("agachamento-livre", "Agachamento livre", "Pernas", ["quadriceps", "gluteos", "adutores"], "agachar", "barra", ["agachamento", "agachamento com barra"]),
  ex("agachamento-frontal", "Agachamento frontal", "Pernas", ["quadriceps", "gluteos"], "agachar", "barra"),
  ex("agachamento-smith", "Agachamento no Smith", "Pernas", ["quadriceps", "gluteos"], "agachar", "smith", ["agachamento smith"]),
  ex("agachamento-goblet", "Agachamento goblet", "Pernas", ["quadriceps", "gluteos"], "agachar", "halteres", ["goblet"]),
  ex("agachamento-hack", "Agachamento hack", "Pernas", ["quadriceps", "gluteos"], "agachar", "maquina", ["hack", "hack machine"]),
  ex("leg-press", "Leg press", "Pernas", ["quadriceps", "gluteos", "adutores"], "agachar", "maquina", ["leg press 45", "leg 45"]),
  ex("cadeira-extensora", "Cadeira extensora", "Pernas", ["quadriceps"], "isolado", "maquina", ["extensora"]),
  ex("mesa-flexora", "Mesa flexora", "Pernas", ["posteriores"], "isolado", "maquina", ["flexora deitada"]),
  ex("cadeira-flexora", "Cadeira flexora", "Pernas", ["posteriores"], "isolado", "maquina", ["flexora sentada"]),
  ex("stiff", "Stiff", "Pernas", ["posteriores", "gluteos", "lombar"], "quadril", "barra", ["stiff com barra"]),
  ex("terra-romeno", "Levantamento terra romeno", "Pernas", ["posteriores", "gluteos", "lombar"], "quadril", "barra", ["terra romeno", "rdl"]),
  ex("stiff-halteres", "Stiff com halteres", "Pernas", ["posteriores", "gluteos", "lombar"], "quadril", "halteres"),
  ex("afundo", "Afundo", "Pernas", ["quadriceps", "gluteos"], "unilateral-pernas", "halteres", ["passada", "avanço"]),
  ex("agachamento-bulgaro", "Agachamento búlgaro", "Pernas", ["quadriceps", "gluteos"], "unilateral-pernas", "halteres", ["búlgaro"]),
  ex("cadeira-adutora", "Cadeira adutora", "Pernas", ["adutores"], "isolado", "maquina", ["adutora"]),
  ex("panturrilha-em-pe", "Panturrilha em pé", "Pernas", ["panturrilhas"], "isolado", "maquina", ["gêmeos em pé"]),
  ex("panturrilha-sentado", "Panturrilha sentado", "Pernas", ["panturrilhas"], "isolado", "maquina", ["sóleo"]),
  ex("panturrilha-leg-press", "Panturrilha no leg press", "Pernas", ["panturrilhas"], "isolado", "maquina"),
  ex("panturrilha-halteres", "Panturrilha em pé com halteres", "Pernas", ["panturrilhas"], "isolado", "halteres"),

  // Glúteos
  ex("elevacao-pelvica", "Elevação pélvica", "Glúteos", ["gluteos", "posteriores"], "quadril", "barra", ["hip thrust"]),
  ex("gluteo-polia", "Glúteo na polia", "Glúteos", ["gluteos"], "isolado", "polia", ["coice na polia", "kickback"]),
  ex("cadeira-abdutora", "Cadeira abdutora", "Glúteos", ["gluteos"], "isolado", "maquina", ["abdutora"]),
  ex("ponte-gluteo", "Ponte de glúteo", "Glúteos", ["gluteos", "posteriores"], "quadril", "peso-corporal", ["ponte"]),

  // Abdômen
  ex("prancha", "Prancha", "Abdômen", ["abdomen"], "core", "peso-corporal", ["prancha isométrica"]),
  ex("abdominal-supra", "Abdominal supra", "Abdômen", ["abdomen"], "core", "peso-corporal", ["abdominal", "crunch"]),
  ex("abdominal-infra", "Abdominal infra", "Abdômen", ["abdomen"], "core", "peso-corporal", ["elevação de pernas"]),
  ex("abdominal-polia", "Abdominal na polia", "Abdômen", ["abdomen"], "core", "polia", ["abdominal na corda"]),
  ex("abdominal-maquina", "Abdominal na máquina", "Abdômen", ["abdomen"], "core", "maquina"),
  ex("roda-abdominal", "Roda abdominal", "Abdômen", ["abdomen"], "core", "peso-corporal", ["rodinha"]),
];

const BY_KEY = new Map(EXERCISE_LIBRARY.map((entry) => [entry.key, entry]));

export function libraryEntry(key: string | undefined): LibraryExercise | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export function isLibraryKey(value: string): boolean {
  return BY_KEY.has(value);
}

/** Minúsculas, sem acento, sem pontuação e com espaços simples: "Tríceps  Pulley!" → "triceps pulley". */
export function normalizeExerciseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesOf(entry: LibraryExercise): string[] {
  return [entry.name, ...(entry.aliases ?? [])].map(normalizeExerciseName);
}

/**
 * Reconhece um exercício já cadastrado pelo nome (ou por um apelido comum), para sugerir o vínculo. Só casamento
 * exato depois de normalizar: "Supino reto" ↔ Supino reto com barra, "Serrote" ↔ Remada unilateral. Na dúvida, nada.
 */
export function matchLibrary(name: string): LibraryExercise | null {
  const wanted = normalizeExerciseName(name);
  if (!wanted) return null;
  return EXERCISE_LIBRARY.find((entry) => namesOf(entry).includes(wanted)) ?? null;
}

/**
 * Busca para o cadastro: todas as palavras digitadas precisam aparecer no nome ou num apelido. O nome que COMEÇA com o
 * texto vem antes; depois, a ordem da biblioteca (agrupada por músculo).
 */
export function searchLibrary(query: string, limit = 8): LibraryExercise[] {
  const words = normalizeExerciseName(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const wanted = words.join(" ");
  const scored: { entry: LibraryExercise; rank: number; index: number }[] = [];
  EXERCISE_LIBRARY.forEach((entry, index) => {
    const names = namesOf(entry);
    if (!names.some((n) => words.every((w) => n.includes(w)))) return;
    const rank = names[0].startsWith(wanted) ? 0 : names.some((n) => n.startsWith(wanted)) ? 1 : 2;
    scored.push({ entry, rank, index });
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.entry);
}
