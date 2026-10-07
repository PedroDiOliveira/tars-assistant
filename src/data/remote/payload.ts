import type { AppData } from "@/domain/snapshot";

/** O que `GET /api/snapshot` devolve. Compartilhado entre o servidor (que monta) e o navegador (que lê). */
export interface SnapshotPayload {
  data: AppData;
  profile: { displayName: string } | null;
  user: { email: string | null };
  /** Relógio do servidor em ms; permite corrigir a diferença para o relógio do aparelho (cronômetro). */
  serverNow: number;
  /** O que o servidor tem ligado; a interface esconde o que não está disponível. */
  /** `aiProvider` é o nome mostrado no aviso de consentimento (para quem as mensagens são enviadas) */
  capabilities: { ai: boolean; aiProvider: string | null };
}
