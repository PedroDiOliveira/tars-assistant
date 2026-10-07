import { describe, expect, it } from "vitest";
import { keyboardInset, scrollDeltaToReveal } from "./keyboard";

const iphone = { layoutHeight: 844, scale: 1 };

describe("keyboardInset", () => {
  it("é 0 sem teclado", () => {
    expect(keyboardInset({ ...iphone, visibleHeight: 844, offsetTop: 0 })).toBe(0);
  });

  it("é a parte do fim da janela que o teclado cobre (Android e iOS sem rolagem)", () => {
    expect(keyboardInset({ ...iphone, visibleHeight: 508, offsetTop: 0 })).toBe(336);
  });

  it("desconta a rolagem que o iOS aplica na parte visível ao abrir o teclado", () => {
    // O iOS desce a parte visível 40 px: ela termina em 40 + 508 = 548, então só 296 px da janela ficam cobertos.
    expect(keyboardInset({ ...iphone, visibleHeight: 508, offsetTop: 40 })).toBe(296);
  });

  it("ignora diferenças pequenas: barra do navegador, barra de atalhos de teclado físico", () => {
    expect(keyboardInset({ ...iphone, visibleHeight: 800, offsetTop: 0 })).toBe(0);
    expect(keyboardInset({ ...iphone, visibleHeight: 790, offsetTop: 0 })).toBe(0);
  });

  it("não confunde zoom por pinça com teclado", () => {
    expect(keyboardInset({ layoutHeight: 844, visibleHeight: 422, offsetTop: 0, scale: 2 })).toBe(0);
  });

  it("não fica negativo se a janela de layout também encolher junto com o teclado", () => {
    // Navegadores que redimensionam a janela (interactive-widget=resizes-content): o CSS normal já resolve.
    expect(keyboardInset({ layoutHeight: 508, visibleHeight: 508, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset({ layoutHeight: 500, visibleHeight: 508, offsetTop: 0, scale: 1 })).toBe(0);
  });
});

describe("scrollDeltaToReveal", () => {
  const area = { viewTop: 100, viewBottom: 500 };

  it("não rola quando o trecho já aparece", () => {
    expect(scrollDeltaToReveal({ ...area, top: 200, bottom: 250 })).toBe(0);
  });

  it("rola para baixo o mínimo quando o campo está atrás do teclado/rodapé", () => {
    // bottom 560 passa 60 do limite (500), mais a folga de 8.
    expect(scrollDeltaToReveal({ ...area, top: 500, bottom: 560 })).toBe(68);
  });

  it("rola para cima quando o campo (ou o rótulo) está acima da área", () => {
    expect(scrollDeltaToReveal({ ...area, top: 60, bottom: 110 })).toBe(-48);
  });

  it("mantém a folga nas duas bordas", () => {
    expect(scrollDeltaToReveal({ ...area, top: 108, bottom: 492 })).toBe(0);
    expect(scrollDeltaToReveal({ ...area, top: 107, bottom: 150 })).toBe(-1);
    expect(scrollDeltaToReveal({ ...area, top: 400, bottom: 493 })).toBe(1);
  });

  it("se o trecho é maior que a área, prioriza o topo (onde está o rótulo)", () => {
    const delta = scrollDeltaToReveal({ ...area, top: 300, bottom: 900 });
    expect(delta).toBe(300 - 108);
  });
});
