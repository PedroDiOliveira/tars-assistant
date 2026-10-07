/**
 * Categorias, matérias e capas se distinguem por matiz, mas todas dentro da família verde da
 * paleta (lime → esmeralda → teal). Nada de cores avulsas fora da identidade.
 */
export const HUE_MIN = 95;
export const HUE_MAX = 185;

/** Distribui n matizes igualmente dentro da faixa verde. */
export function greenHue(index: number, total = 8): number {
  const span = HUE_MAX - HUE_MIN;
  return HUE_MIN + Math.round((span * (index % total)) / Math.max(1, total - 1));
}

/** Matiz estável a partir de um texto (capa de livro, por exemplo). */
export function hueFromText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return HUE_MIN + (hash % (HUE_MAX - HUE_MIN));
}
