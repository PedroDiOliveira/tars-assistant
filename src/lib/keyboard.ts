/**
 * Teclado virtual (iOS e Android): ele cobre a parte de baixo da tela SEM encolher a janela de layout, então tudo
 * que é `position: fixed; bottom: 0` (os sheets de cadastro, o campo do assistente) fica atrás dele. O que muda é a
 * `visualViewport`: ela encolhe para a parte realmente visível. Daqui sai o quanto o teclado cobre, e o que o resto
 * do app usa para ajustar esses elementos (`--kb-inset`, `--vv-height` e `html[data-keyboard]`, ver `KeyboardInsetSync`).
 */

/** Disparado em `window`, depois de as variáveis CSS terem sido atualizadas, a cada mudança do teclado. */
export const KEYBOARD_EVENT = "tars:keyboard-change";

/**
 * Abaixo disto não é teclado: é a barra do navegador recolhendo, o zoom por pinça ou a barra de atalhos de um
 * teclado físico. O menor teclado de software (iPhone SE, em pé) passa de 200 px.
 */
const MIN_KEYBOARD_HEIGHT = 80;

export interface ViewportMetrics {
  /** `window.innerHeight`: a janela de layout, que o teclado não encolhe */
  layoutHeight: number;
  /** `visualViewport.height`: o que de fato aparece */
  visibleHeight: number;
  /** `visualViewport.offsetTop`: quanto o navegador rolou a parte visível (o iOS faz isso ao abrir o teclado) */
  offsetTop: number;
  /** `visualViewport.scale`: 1 sem zoom */
  scale: number;
}

export interface KeyboardMetrics {
  /** quanto a parte visível encolheu por causa do teclado; 0 = teclado fechado */
  height: number;
  /**
   * quanto subir, a partir do fim da janela de layout, um elemento fixo no rodapé para ele ficar colado no topo do
   * teclado. Pode ser 0 com o teclado aberto: o iOS rola a parte visível até o fim da janela coincidir com o topo do
   * teclado, e aí `bottom: 0` já está no lugar certo (subir mais o deixaria fora da tela).
   */
  lift: number;
}

const CLOSED: KeyboardMetrics = { height: 0, lift: 0 };

/**
 * Se o teclado está aberto, usa o encolhimento da parte visível (`layoutHeight - visibleHeight`), que não depende de
 * o iOS ter rolado a tela ou não. Já a distância para ancorar os elementos fixos desconta essa rolagem (`offsetTop`):
 * o fim da parte visível, em coordenadas da janela de layout, é `offsetTop + visibleHeight`.
 */
export function keyboardMetrics({ layoutHeight, visibleHeight, offsetTop, scale }: ViewportMetrics): KeyboardMetrics {
  // Com zoom por pinça a parte visível também encolhe, sem teclado nenhum.
  if (Math.abs(scale - 1) > 0.01) return CLOSED;
  const height = layoutHeight - visibleHeight;
  if (height < MIN_KEYBOARD_HEIGHT) return CLOSED;
  return { height: Math.round(height), lift: Math.max(0, Math.round(layoutHeight - (offsetTop + visibleHeight))) };
}

export interface RevealInput {
  /** retângulo do que deve aparecer (campo + rótulo), nas mesmas coordenadas da área visível */
  top: number;
  bottom: number;
  /** área visível da lista rolável, já sem o rodapé fixo por cima dela */
  viewTop: number;
  viewBottom: number;
  /** folga entre o campo e a borda da área visível */
  margin?: number;
}

/**
 * Quanto rolar a lista (positivo = para baixo) para o trecho aparecer inteiro. Rola o mínimo; se o trecho for maior
 * que a área visível, prioriza o topo, que é onde fica o rótulo ("o que é pra digitar aqui").
 */
export function scrollDeltaToReveal({ top, bottom, viewTop, viewBottom, margin = 8 }: RevealInput): number {
  const minTop = viewTop + margin;
  const maxBottom = viewBottom - margin;
  if (top < minTop) return top - minTop;
  if (bottom > maxBottom) return Math.min(bottom - maxBottom, top - minTop);
  return 0;
}

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "image"]);

export function isTextField(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Rola a lista do sheet o suficiente para o campo em foco (e o rótulo dele) ficar visível: nem abaixo do teclado,
 * nem atrás do botão de salvar, que fica fixo no fim da lista.
 */
export function revealFocusedField(scroller: HTMLElement): void {
  const field = document.activeElement;
  if (!isTextField(field) || !scroller.contains(field)) return;

  const area = scroller.getBoundingClientRect();
  const footer = scroller.querySelector<HTMLElement>("[data-sheet-footer]");
  const viewBottom = footer ? Math.min(area.bottom, footer.getBoundingClientRect().top) : area.bottom;

  const box = field.getBoundingClientRect();
  // O rótulo vem junto: sem ele não dá para saber o que digitar. Sem rótulo associado, uma faixa acima do campo.
  const label = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.labels?.[0] : undefined;
  const labelBox = label && label.getBoundingClientRect();
  const top = labelBox && labelBox.top < box.top && box.top - labelBox.top < 120 ? labelBox.top : box.top - 40;

  const delta = scrollDeltaToReveal({ top, bottom: box.bottom, viewTop: area.top, viewBottom });
  if (delta !== 0) scroller.scrollTop += delta;
}
