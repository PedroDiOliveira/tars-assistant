import type { Command } from "@/domain/commands";
import { applyCommand } from "@/domain/reducers";
import type { AppData } from "@/domain/snapshot";

/**
 * Uma "rajada" é o período em que há comandos esperando o servidor. Ela guarda o estado que o servidor já
 * conhecia quando o primeiro deles saiu (`base`) e a lista, em ordem, do que foi enviado depois. A tela mostra
 * sempre `base` + esses comandos; quando um deles falha, ele sai da lista e a tela é refeita SEM ele, em vez de
 * "voltar ao que era" (que também desfaria o que outro comando, já aplicado, ainda precisa manter).
 */
export interface Burst {
  base: AppData;
  entries: BurstEntry[];
}

/** Um comando da rajada. É comparado por identidade: dois toques iguais continuam sendo duas entradas. */
export interface BurstEntry {
  command: Command;
}

/** Aplica os comandos, em ordem, sobre `base`. Um que o domínio recusar agora (dependia de outro que saiu) é ignorado. */
export function replay(base: AppData, commands: readonly Command[]): AppData {
  let data = base;
  for (const command of commands) {
    const applied = applyCommand(data, command);
    if (applied.ok) data = applied.data;
  }
  return data;
}

export function startBurst(base: AppData): Burst {
  return { base, entries: [] };
}

/** Tira `entry` da rajada e devolve como a tela deve ficar sem ela. */
export function discardEntry(burst: Burst, entry: BurstEntry): AppData {
  burst.entries = burst.entries.filter((e) => e !== entry);
  return replay(
    burst.base,
    burst.entries.map((e) => e.command),
  );
}
