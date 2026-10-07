import type { DataSnapshot } from "@/domain/summary";
import type { StudyTimer, TxTemplate, WorkoutDraft } from "@/domain/types";
import type { Actions, AssistantApi, Result } from "./contract";

/** Estado de carregamento dos dados. Telas só renderizam em "ready". */
export type StoreStatus =
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; message: string; retry: () => void };

export interface Account {
  /** true = dados reais no servidor; false = demonstração local */
  isLive: boolean;
  displayName: string;
  email: string | null;
  /** o servidor tem um provedor de IA configurado? Sem isso o assistente fica oculto. */
  aiEnabled: boolean;
  /** nome do provedor que receberia as mensagens (aviso de consentimento); null no demo */
  aiProvider: string | null;
}

/**
 * Tudo o que as telas precisam de uma fonte de dados. Há duas implementações com a MESMA forma:
 * `demo` (dados fictícios no navegador) e `remote` (Supabase, via servidor). Quem escolhe é `@/data`.
 */
export interface DataLayer {
  useStoreStatus(): StoreStatus;
  /** A abertura animada pode terminar? Só deve esperar o que for local e rápido. */
  useLaunchReady(): boolean;
  /** Tudo o que o domínio lê para calcular totais, metas e históricos. */
  useData(): DataSnapshot;
  useTemplates(): TxTemplate[];
  useDraft(): WorkoutDraft | null;
  useTimer(): StudyTimer | null;
  useAccount(): Account;
  actions: Actions;
  assistant: AssistantApi;
  /** Encerra a sessão e apaga os dados locais do usuário. Em falha, a sessão continua e o erro é devolvido. */
  signOut(): Promise<Result>;
}
