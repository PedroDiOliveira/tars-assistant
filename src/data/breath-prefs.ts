import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_BREATH_PATTERN, isBreathPatternId, type BreathPatternId } from "@/domain/breathing";

/**
 * Preferências da respiração guiada. Vivem SÓ neste aparelho (nada vai ao banco), como as da água: o padrão escolhido
 * e se o som ambiente está ligado. Valem nos dois modos e são apagadas ao sair da conta.
 */
export const BREATH_PREFS_KEY = "tars-breath-prefs-v1";

export interface BreathPrefs {
  pattern: BreathPatternId;
  /** som ambiente; desligado de fábrica */
  sound: boolean;
}

const DEFAULTS: BreathPrefs = { pattern: DEFAULT_BREATH_PATTERN, sound: false };

/** O que veio do armazenamento pode estar velho ou adulterado: campo inválido volta ao valor de fábrica. */
export function sanitizeBreathPrefs(raw: unknown): BreathPrefs {
  const data = (typeof raw === "object" && raw !== null ? raw : {}) as { pattern?: unknown; sound?: unknown };
  return {
    pattern: isBreathPatternId(data.pattern) ? data.pattern : DEFAULTS.pattern,
    sound: typeof data.sound === "boolean" ? data.sound : DEFAULTS.sound,
  };
}

interface BreathPrefsState extends BreathPrefs {
  setPattern(pattern: BreathPatternId): void;
  setSound(sound: boolean): void;
}

export const useBreathPrefs = create<BreathPrefsState>()(
  persist<BreathPrefsState, [], [], BreathPrefs>(
    (set) => ({
      ...DEFAULTS,
      setPattern: (pattern) => set({ pattern }),
      setSound: (sound) => set({ sound }),
    }),
    {
      name: BREATH_PREFS_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ pattern, sound }) => ({ pattern, sound }),
      merge: (persisted, current) => ({ ...current, ...sanitizeBreathPrefs(persisted) }),
      // O Next renderiza no servidor: a reidratação é disparada manualmente no navegador.
      skipHydration: true,
    },
  ),
);

/** Carrega as preferências salvas. Sem armazenamento (janela anônima), valem as de fábrica. */
export async function hydrateBreathPrefs(): Promise<void> {
  try {
    await useBreathPrefs.persist.rehydrate();
  } catch {
    // sem armazenamento local: as preferências só duram enquanto a aba estiver aberta
  }
}

/** Volta às preferências de fábrica e apaga o que está guardado (sair da conta). */
export function wipeBreathPrefs(): void {
  useBreathPrefs.setState({ ...DEFAULTS });
  try {
    localStorage.removeItem(BREATH_PREFS_KEY);
  } catch {
    // nada a apagar
  }
}
