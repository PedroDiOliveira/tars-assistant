import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_WATER_PORTIONS,
  DEFAULT_WATER_PORTION_INDEX,
  portionsError,
  type WaterPortions,
} from "@/domain/water";

/**
 * Preferências do contador de água. Vivem SÓ neste aparelho (nada vai ao banco): são três números e uma escolha,
 * e a pessoa muda de porção várias vezes ao dia. Valem nos dois modos (demo e real) e são apagadas ao sair da conta.
 * Limitação conhecida: porções editadas no celular não aparecem no outro aparelho.
 */
export const WATER_PREFS_KEY = "tars-water-prefs-v1";

export type PortionIndex = 0 | 1 | 2;

export interface WaterPrefs {
  /** copo, garrafa e garrafa grande, em ml, em ordem crescente */
  portions: WaterPortions;
  /** qual das três o toque na gota soma */
  selected: PortionIndex;
}

const DEFAULTS: WaterPrefs = {
  portions: DEFAULT_WATER_PORTIONS,
  selected: DEFAULT_WATER_PORTION_INDEX as PortionIndex,
};

function isIndex(value: unknown): value is PortionIndex {
  return value === 0 || value === 1 || value === 2;
}

/**
 * O que veio do armazenamento pode estar velho, adulterado ou truncado: só entra o que passa na MESMA regra do
 * formulário de edição. Qualquer coisa fora disso volta aos valores de fábrica, campo a campo.
 */
export function sanitizeWaterPrefs(raw: unknown): WaterPrefs {
  const data = (typeof raw === "object" && raw !== null ? raw : {}) as { portions?: unknown; selected?: unknown };
  const portions =
    Array.isArray(data.portions) && data.portions.length === 3 && portionsError(data.portions as number[]) === null
      ? (data.portions as unknown as WaterPortions)
      : DEFAULTS.portions;
  const selected = isIndex(data.selected) ? data.selected : DEFAULTS.selected;
  return { portions, selected };
}

interface WaterPrefsState extends WaterPrefs {
  select(index: PortionIndex): void;
  /** Devolve a mensagem de erro (e não grava nada) se as três quantidades não forem válidas. */
  setPortions(portions: readonly number[]): string | null;
}

export const useWaterPrefs = create<WaterPrefsState>()(
  persist<WaterPrefsState, [], [], WaterPrefs>(
    (set) => ({
      ...DEFAULTS,
      select: (selected) => set({ selected }),
      setPortions: (portions) => {
        const error = portionsError(portions);
        if (error) return error;
        set({ portions: [portions[0], portions[1], portions[2]] });
        return null;
      },
    }),
    {
      name: WATER_PREFS_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Só os dados vão ao armazenamento, nunca as funções.
      partialize: ({ portions, selected }) => ({ portions, selected }),
      merge: (persisted, current) => ({ ...current, ...sanitizeWaterPrefs(persisted) }),
      // O Next renderiza no servidor: a reidratação é disparada manualmente no navegador.
      skipHydration: true,
    },
  ),
);

/** Carrega as preferências salvas. Armazenamento indisponível (janela anônima) não trava nada: valem as de fábrica. */
export async function hydrateWaterPrefs(): Promise<void> {
  try {
    await useWaterPrefs.persist.rehydrate();
  } catch {
    // sem armazenamento local: as preferências só duram enquanto a aba estiver aberta
  }
}

/** Volta às preferências de fábrica e apaga o que está guardado (sair da conta). */
export function wipeWaterPrefs(): void {
  useWaterPrefs.setState({ ...DEFAULTS });
  try {
    localStorage.removeItem(WATER_PREFS_KEY);
  } catch {
    // nada a apagar
  }
}
