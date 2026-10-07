import {
  addDays,
  addMonths,
  monthEnd,
  monthOf,
  monthStart,
  weekStart,
  weekdayIndex,
  type DateKey,
} from "@/lib/dates";
import type {
  Book,
  Category,
  Exercise,
  Goal,
  ReadingSession,
  SessionExercise,
  StudySession,
  Subject,
  Transaction,
  TxTemplate,
  WorkoutPlan,
  WorkoutSession,
} from "@/domain/types";

/** Dados de demonstração gerados em relação a "hoje", para as telas nunca ficarem vazias. */
export interface SeedData {
  categories: Category[];
  transactions: Transaction[];
  templates: TxTemplate[];
  goals: Goal[];
  exercises: Exercise[];
  plans: WorkoutPlan[];
  sessions: WorkoutSession[];
  subjects: Subject[];
  studySessions: StudySession[];
  books: Book[];
  readingSessions: ReadingSession[];
}

/* Catálogos iniciais em PT-BR (editáveis no app real). */

export const CATEGORIES: Category[] = [
  { id: "cat-food", name: "Alimentação", type: "expense", icon: "utensils", hue: 65 },
  { id: "cat-transport", name: "Transporte", type: "expense", icon: "car", hue: 250 },
  { id: "cat-home", name: "Moradia", type: "expense", icon: "home", hue: 35 },
  { id: "cat-health", name: "Saúde", type: "expense", icon: "heart", hue: 15 },
  { id: "cat-fun", name: "Lazer", type: "expense", icon: "fun", hue: 320 },
  { id: "cat-shop", name: "Compras", type: "expense", icon: "bag", hue: 200 },
  { id: "cat-edu", name: "Educação", type: "expense", icon: "school", hue: 285 },
  { id: "cat-other", name: "Outros", type: "expense", icon: "dots", hue: 240 },
  { id: "cat-salary", name: "Salário", type: "income", icon: "wage", hue: 150 },
  { id: "cat-income-other", name: "Outros", type: "income", icon: "plus", hue: 180 },
];

export const EXERCISES: Exercise[] = [
  { id: "ex-supino", name: "Supino reto", muscleGroup: "Peito", loadType: "external" },
  { id: "ex-supino-inc", name: "Supino inclinado com halteres", muscleGroup: "Peito", loadType: "external" },
  { id: "ex-crucifixo", name: "Crucifixo", muscleGroup: "Peito", loadType: "external" },
  { id: "ex-triceps-pulley", name: "Tríceps pulley", muscleGroup: "Tríceps", loadType: "external" },
  { id: "ex-triceps-testa", name: "Tríceps testa", muscleGroup: "Tríceps", loadType: "external" },
  { id: "ex-barra", name: "Barra fixa", muscleGroup: "Costas", loadType: "bodyweight" },
  { id: "ex-puxada", name: "Puxada frontal", muscleGroup: "Costas", loadType: "external" },
  { id: "ex-remada-curvada", name: "Remada curvada", muscleGroup: "Costas", loadType: "external" },
  { id: "ex-remada-baixa", name: "Remada baixa", muscleGroup: "Costas", loadType: "external" },
  { id: "ex-rosca", name: "Rosca direta", muscleGroup: "Bíceps", loadType: "external" },
  { id: "ex-martelo", name: "Rosca martelo", muscleGroup: "Bíceps", loadType: "external" },
  { id: "ex-agachamento", name: "Agachamento livre", muscleGroup: "Pernas", loadType: "external" },
  { id: "ex-leg", name: "Leg press", muscleGroup: "Pernas", loadType: "external" },
  { id: "ex-flexora", name: "Mesa flexora", muscleGroup: "Pernas", loadType: "external" },
  { id: "ex-panturrilha", name: "Panturrilha em pé", muscleGroup: "Pernas", loadType: "external" },
  { id: "ex-desenvolvimento", name: "Desenvolvimento com halteres", muscleGroup: "Ombros", loadType: "external" },
  { id: "ex-lateral", name: "Elevação lateral", muscleGroup: "Ombros", loadType: "external" },
];

export const PLANS: WorkoutPlan[] = [
  {
    id: "plan-a",
    name: "Treino A — Peito e tríceps",
    exercises: [
      { exerciseId: "ex-supino", plannedSets: 4, repMin: 6, repMax: 10, restSeconds: 120 },
      { exerciseId: "ex-supino-inc", plannedSets: 3, repMin: 8, repMax: 12, restSeconds: 90 },
      { exerciseId: "ex-crucifixo", plannedSets: 3, repMin: 10, repMax: 15, restSeconds: 60 },
      { exerciseId: "ex-triceps-pulley", plannedSets: 3, repMin: 10, repMax: 12, restSeconds: 60 },
      { exerciseId: "ex-triceps-testa", plannedSets: 3, repMin: 10, repMax: 12, restSeconds: 60 },
    ],
  },
  {
    id: "plan-b",
    name: "Treino B — Costas e bíceps",
    exercises: [
      { exerciseId: "ex-barra", plannedSets: 3, repMin: 5, repMax: 10, restSeconds: 120 },
      { exerciseId: "ex-puxada", plannedSets: 4, repMin: 8, repMax: 12, restSeconds: 90 },
      { exerciseId: "ex-remada-curvada", plannedSets: 4, repMin: 8, repMax: 10, restSeconds: 90 },
      { exerciseId: "ex-remada-baixa", plannedSets: 3, repMin: 10, repMax: 12, restSeconds: 75 },
      { exerciseId: "ex-rosca", plannedSets: 3, repMin: 8, repMax: 12, restSeconds: 60 },
      { exerciseId: "ex-martelo", plannedSets: 3, repMin: 10, repMax: 12, restSeconds: 60 },
    ],
  },
  {
    id: "plan-c",
    name: "Treino C — Pernas e ombros",
    exercises: [
      { exerciseId: "ex-agachamento", plannedSets: 4, repMin: 6, repMax: 10, restSeconds: 150 },
      { exerciseId: "ex-leg", plannedSets: 3, repMin: 10, repMax: 12, restSeconds: 90 },
      { exerciseId: "ex-flexora", plannedSets: 3, repMin: 10, repMax: 12, restSeconds: 75 },
      { exerciseId: "ex-panturrilha", plannedSets: 4, repMin: 12, repMax: 15, restSeconds: 45 },
      { exerciseId: "ex-desenvolvimento", plannedSets: 3, repMin: 8, repMax: 12, restSeconds: 90 },
      { exerciseId: "ex-lateral", plannedSets: 3, repMin: 12, repMax: 15, restSeconds: 45 },
    ],
  },
];

export const SUBJECTS: Subject[] = [
  { id: "sub-sql", name: "SQL", objective: "Banco do Brasil", hue: 250 },
  { id: "sub-pt", name: "Português", objective: "Banco do Brasil", hue: 150 },
  { id: "sub-redes", name: "Redes", objective: "Banco do Brasil", hue: 35 },
  { id: "sub-seg", name: "Segurança", objective: "Banco do Brasil", hue: 330 },
];

/** Pesos de partida por exercício (kg). */
const BASE_WEIGHT: Record<string, number> = {
  "ex-supino": 60,
  "ex-supino-inc": 22,
  "ex-crucifixo": 14,
  "ex-triceps-pulley": 30,
  "ex-triceps-testa": 25,
  "ex-barra": 0,
  "ex-puxada": 55,
  "ex-remada-curvada": 50,
  "ex-remada-baixa": 50,
  "ex-rosca": 25,
  "ex-martelo": 12,
  "ex-agachamento": 80,
  "ex-leg": 180,
  "ex-flexora": 40,
  "ex-panturrilha": 70,
  "ex-desenvolvimento": 18,
  "ex-lateral": 8,
};

/** Gerador pseudoaleatório determinístico: o demo fica igual a cada reset no mesmo dia. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function instantAt(key: DateKey, hourUtc: number, minute = 0): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hourUtc, minute);
}

export function buildSeed(today: DateKey): SeedData {
  const rand = mulberry32(hashKey(today));
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
  let counter = 0;
  const id = (prefix: string) => `${prefix}-${(counter += 1)}`;

  const thisMonth = monthOf(today);
  const lastMonth = addMonths(thisMonth, -1);

  /* ---------- Finanças ---------- */
  const transactions: Transaction[] = [];
  const addTx = (
    date: DateKey,
    type: Transaction["type"],
    categoryId: string,
    description: string,
    cents: number,
  ) => {
    if (date > today) return;
    transactions.push({
      id: id("tx"),
      type,
      amountCents: cents,
      categoryId,
      description,
      occurredOn: date,
      source: "manual",
    });
  };

  for (const month of [lastMonth, thisMonth]) {
    const day = (n: number) => `${month}-${String(n).padStart(2, "0")}`;
    addTx(day(5), "income", "cat-salary", "Salário", 480_000);
    addTx(day(5), "expense", "cat-home", "Aluguel", 135_000);
    addTx(day(10), "expense", "cat-home", "Condomínio", 28_000);
    addTx(day(12), "expense", "cat-home", "Internet", 9_990);
    addTx(day(15), "expense", "cat-home", "Conta de luz", 14_235);
    if (month === lastMonth) addTx(day(18), "income", "cat-income-other", "Freela", 60_000);

    const last = monthEnd(month);
    for (let n = 1; day(n) <= last; n += 1) {
      const date = day(n);
      if (date > today) break;
      const weekend = weekdayIndex(date) >= 5;
      if (rand() < 0.75)
        addTx(date, "expense", "cat-food", pick(["Almoço", "iFood", "Padaria", "Jantar"]), between(1800, 6200));
      if (rand() < 0.2) addTx(date, "expense", "cat-food", "Mercado", between(6000, 21000));
      if (rand() < 0.35)
        addTx(date, "expense", "cat-transport", pick(["Uber", "Metrô", "Estacionamento"]), between(700, 3500));
      if (weekend && rand() < 0.5)
        addTx(date, "expense", "cat-fun", pick(["Cinema", "Bar com amigos", "Show"]), between(4000, 15000));
      if (rand() < 0.07) addTx(date, "expense", "cat-shop", pick(["Camiseta", "Amazon", "Presente"]), between(6000, 25000));
      if (rand() < 0.06) addTx(date, "expense", "cat-health", pick(["Farmácia", "Consulta"]), between(2500, 12000));
      if (rand() < 0.04) addTx(date, "expense", "cat-edu", pick(["Curso online", "Livro"]), between(3000, 9000));
    }
  }
  if (!transactions.some((t) => t.occurredOn === today && t.type === "expense")) {
    addTx(today, "expense", "cat-food", "Café", 1_100);
  }

  const templates: TxTemplate[] = [
    { id: "tpl-lunch", label: "Almoço", type: "expense", amountCents: 3_500, categoryId: "cat-food" },
    { id: "tpl-uber", label: "Uber", type: "expense", amountCents: 2_200, categoryId: "cat-transport" },
    { id: "tpl-coffee", label: "Café", type: "expense", amountCents: 800, categoryId: "cat-food" },
    { id: "tpl-market", label: "Mercado", type: "expense", amountCents: 15_000, categoryId: "cat-food" },
  ];

  /* ---------- Metas (por vigência) ---------- */
  const monthFrom = monthStart(addMonths(thisMonth, -3));
  const weekNow = weekStart(today);
  const weekFrom = addDays(weekNow, -7 * 12);
  const goals: Goal[] = [
    { id: "g-savings", kind: "savings", scopeId: null, validFrom: monthFrom, target: 150_000 },
    { id: "g-b-food", kind: "category_budget", scopeId: "cat-food", validFrom: monthFrom, target: 80_000 },
    { id: "g-b-transport", kind: "category_budget", scopeId: "cat-transport", validFrom: monthFrom, target: 30_000 },
    { id: "g-b-fun", kind: "category_budget", scopeId: "cat-fun", validFrom: monthFrom, target: 25_000 },
    { id: "g-b-shop", kind: "category_budget", scopeId: "cat-shop", validFrom: monthFrom, target: 30_000 },
    // Treino: 3 por semana até a semana -5; 4 por semana depois (o passado fica como estava).
    { id: "g-workout-1", kind: "workout_sessions", scopeId: null, validFrom: weekFrom, target: 3 },
    { id: "g-workout-2", kind: "workout_sessions", scopeId: null, validFrom: addDays(weekNow, -28), target: 4 },
    { id: "g-study", kind: "study_minutes", scopeId: null, validFrom: weekFrom, target: 600 },
    { id: "g-study-sql", kind: "study_minutes", scopeId: "sub-sql", validFrom: weekFrom, target: 240 },
    { id: "g-study-pt", kind: "study_minutes", scopeId: "sub-pt", validFrom: weekFrom, target: 180 },
    { id: "g-study-redes", kind: "study_minutes", scopeId: "sub-redes", validFrom: weekFrom, target: 120 },
    { id: "g-reading", kind: "reading_pages", scopeId: null, validFrom: weekFrom, target: 70 },
  ];

  /* ---------- Treino ---------- */
  const sessions: WorkoutSession[] = [];
  // seg A, ter B, qui C, sex A. A semana -5 teve 3 treinos e a -4 teve 3 (meta 4): quebra a sequência.
  const pattern: [number, string][] = [
    [0, "plan-a"],
    [1, "plan-b"],
    [3, "plan-c"],
    [4, "plan-a"],
  ];
  const exById = new Map(EXERCISES.map((e) => [e.id, e]));
  for (let w = -5; w <= 0; w += 1) {
    const ws = addDays(weekNow, 7 * w);
    for (const [dayIdx, planId] of pattern) {
      if (w === -5 && dayIdx === 4) continue;
      if (w === -4 && dayIdx === 1) continue;
      const date = addDays(ws, dayIdx);
      if (date >= today) continue;
      const plan = PLANS.find((p) => p.id === planId)!;
      const progress = 1 + 0.02 * (w + 5);
      const exercises: SessionExercise[] = plan.exercises.map((pe) => {
        const ex = exById.get(pe.exerciseId)!;
        const base = BASE_WEIGHT[pe.exerciseId] ?? 0;
        const weight = base === 0 ? 0 : roundTo(base * progress, base >= 30 ? 2.5 : 1);
        return {
          exerciseId: pe.exerciseId,
          nameSnapshot: ex.name,
          loadType: ex.loadType,
          plannedSets: pe.plannedSets,
          repMin: pe.repMin,
          repMax: pe.repMax,
          restSeconds: pe.restSeconds,
          sets: Array.from({ length: pe.plannedSets }, (_, i) => ({
            weightKg: weight,
            reps: Math.max(pe.repMin, pe.repMax - between(0, 3) - (i > 1 ? 1 : 0)),
            done: true,
          })),
        };
      });
      const startedAt = instantAt(date, 21, between(0, 40));
      sessions.push({
        id: id("ws"),
        planId,
        nameSnapshot: plan.name,
        startedAt,
        finishedAt: startedAt + between(52, 78) * 60_000,
        occurredOn: date,
        exercises,
      });
    }
  }

  /* ---------- Estudos ---------- */
  const studySessions: StudySession[] = [];
  const subjectPool = ["sub-sql", "sub-sql", "sub-pt", "sub-pt", "sub-redes", "sub-seg"];
  for (let back = 1; back <= 35; back += 1) {
    const date = addDays(today, -back);
    const weekend = weekdayIndex(date) >= 5;
    // Ontem sempre tem estudo: o demo nunca abre com a semana vazia.
    if (back !== 1 && rand() > (weekend ? 0.5 : 0.85)) continue;
    const count = rand() < 0.35 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      studySessions.push({
        id: id("st"),
        subjectId: pick(subjectPool),
        source: rand() < 0.7 ? "timer" : "manual",
        occurredOn: date,
        durationSeconds: between(6, 18) * 5 * 60,
      });
    }
  }

  /* ---------- Leitura ---------- */
  const books: Book[] = [
    { id: "book-habits", title: "Hábitos Atômicos", author: "James Clear", totalPages: 320, initialPage: 40, status: "reading" },
    { id: "book-clean", title: "Código Limpo", author: "Robert C. Martin", totalPages: 464, initialPage: 0, status: "want" },
    { id: "book-alq", title: "O Alquimista", author: "Paulo Coelho", totalPages: 208, initialPage: 0, status: "done" },
    { id: "book-sapiens", title: "Sapiens", author: "Yuval Noah Harari", totalPages: 472, initialPage: 0, status: "paused" },
  ];
  const readingSessions: ReadingSession[] = [];
  const readRun = (
    bookId: string,
    from: number,
    startBack: number,
    endBack: number,
    stopAt: number,
    alwaysOnLastDay = false,
  ) => {
    let position = from;
    for (let back = startBack; back >= endBack; back -= 1) {
      const forced = alwaysOnLastDay && back === endBack;
      if (position >= stopAt || (!forced && rand() > 0.62)) continue;
      const end = Math.min(position + between(8, 24), stopAt);
      readingSessions.push({
        id: id("rd"),
        bookId,
        occurredOn: addDays(today, -back),
        startPage: position,
        endPage: end,
      });
      position = end;
    }
    return position;
  };
  const alqEnd = readRun("book-alq", 0, 60, 40, 208);
  if (alqEnd < 208) {
    readingSessions.push({
      id: id("rd"),
      bookId: "book-alq",
      occurredOn: addDays(today, -39),
      startPage: alqEnd,
      endPage: 208,
    });
  }
  readRun("book-sapiens", 0, 38, 30, 120);
  readRun("book-habits", 40, 17, 1, 300, true);

  return {
    categories: CATEGORIES,
    transactions,
    templates,
    goals,
    exercises: EXERCISES,
    plans: PLANS,
    sessions,
    subjects: SUBJECTS,
    studySessions,
    books,
    readingSessions,
  };
}
