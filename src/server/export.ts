import type { AppData } from "@/domain/snapshot";
import { todayKey } from "@/lib/dates";
import type { Snapshot } from "./snapshot";

/**
 * Versão do formato do arquivo de backup. Sobe quando o formato muda, para um importador futuro saber ler.
 *  1: lançamentos, metas, treinos, estudos, leituras e catálogos.
 *  2: + `data.runningSessions` (corridas; distância em metros e duração em segundos, ausentes quando não informadas)
 *     e a meta `running_meters` (metros) em `data.goals`. Um arquivo v1 é um v2 sem corridas.
 *  3: + `data.waterIntakes` (um registro por toque: `at` em ms desde 1970 e `ml` inteiros) e a meta `water_ml`
 *     (ml POR DIA, com vigência semanal) em `data.goals`. Um arquivo v2 é um v3 sem água.
 *  4: + `effort` nas sessões de musculação (1 leve, 2 na medida, 3 pesado, 4 exaustivo; ausente = não avaliado) e
 *     `libraryKey` nos exercícios (vínculo com a biblioteca do app; ausente = sem vínculo). Um v3 é um v4 sem eles.
 *  5: + `data.trainingProfile` (respostas do formulário do plano de treino, ou null; instantes em ms desde 1970) e
 *     `data.trainingPlans` (planos aceitos: origem, motivos e as fichas que cada um criou). Um v4 é um v5 sem eles.
 *  6: + `data.trainingPlanChanges` (ajustes aceitos no plano em uso: o que mudou, por quê e de onde veio; o texto
 *     livre da pessoa nunca é guardado) e `option` nos planos aceitos (a divisão exata). Um v5 é um v6 sem eles.
 */
export const EXPORT_VERSION = 6;

export interface ExportFile {
  app: "tars";
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  profile: { displayName: string } | null;
  /** Tudo o que o app guarda do usuário: lançamentos, metas, treinos, plano de treino, corridas, água, estudos, leituras e catálogos (inclusive os arquivados). */
  data: AppData;
}

/**
 * Monta o backup a partir do MESMO snapshot que alimenta as telas (já filtrado pelo RLS do usuário). Não inclui
 * e-mail, id de usuário nem nada de autenticação: é um arquivo para a pessoa guardar, não para identificá-la.
 */
export function buildExport(snapshot: Snapshot, now: Date): ExportFile {
  return {
    app: "tars",
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    profile: snapshot.profile,
    data: snapshot.data,
  };
}

/** `tars-backup-AAAA-MM-DD.json`, com a data no fuso do app (23h30 em São Paulo ainda é o dia de São Paulo). */
export function exportFilename(now: Date): string {
  return `tars-backup-${todayKey(now.getTime())}.json`;
}
