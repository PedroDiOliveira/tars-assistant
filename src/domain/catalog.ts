/**
 * Itens de catálogo (categorias, exercícios, matérias, fichas) nunca são apagados depois de usados: são
 * ARQUIVADOS. Arquivado = some das escolhas ao registrar algo novo, mas continua existindo para dar nome ao
 * histórico (lançamentos, treinos e sessões antigas).
 */
export function isActive(item: { archived?: boolean }): boolean {
  return !item.archived;
}

/** Só os ativos, mais (opcionalmente) os ids que precisam continuar visíveis, como o item já escolhido numa edição. */
export function activeOnly<T extends { id: string; archived?: boolean }>(list: T[], alsoKeep: readonly (string | undefined | null)[] = []): T[] {
  return list.filter((item) => !item.archived || alsoKeep.includes(item.id));
}
