import { describe, expect, it } from "vitest";
import { keyboardMetrics, scrollDeltaToReveal } from "./keyboard";

const iphone = { layoutHeight: 844, scale: 1 };

describe("keyboardMetrics", () => {
  const closed = { height: 0, lift: 0 };

  it("é zero sem teclado", () => {
    expect(keyboardMetrics({ ...iphone, visibleHeight: 844, offsetTop: 0 })).toEqual(closed);
  });

  it("Android e iOS sem rolagem: o teclado cobre o fim da janela, então os elementos fixos sobem a altura dele", () => {
    expect(keyboardMetrics({ ...iphone, visibleHeight: 508, offsetTop: 0 })).toEqual({ height: 336, lift: 336 });
  });

  it("iOS rolando um pouco a parte visível: o ponto de ancoragem desconta a rolagem", () => {
    // A parte visível desce 40 px e termina em 548: só 296 px do fim da janela ficam cobertos.
    expect(keyboardMetrics({ ...iphone, visibleHeight: 508, offsetTop: 40 })).toEqual({ height: 336, lift: 296 });
  });

  it("iOS rolando a parte visível a altura inteira do teclado: teclado aberto, mas nada a subir", () => {
    // Era o defeito: o fim da janela já coincide com o topo do teclado, e a altura visível (508) ainda precisa limitar o sheet.
    expect(keyboardMetrics({ ...iphone, visibleHeight: 508, offsetTop: 336 })).toEqual({ height: 336, lift: 0 });
  });

  it("nunca devolve um deslocamento negativo se a rolagem passar do teclado", () => {
    expect(keyboardMetrics({ ...iphone, visibleHeight: 508, offsetTop: 400 })).toEqual({ height: 336, lift: 0 });
  });

  it("ignora diferenças pequenas: barra do navegador, barra de atalhos de teclado físico", () => {
    expect(keyboardMetrics({ ...iphone, visibleHeight: 800, offsetTop: 0 })).toEqual(closed);
    expect(keyboardMetrics({ ...iphone, visibleHeight: 790, offsetTop: 0 })).toEqual(closed);
  });

  it("não confunde zoom por pinça com teclado", () => {
    expect(keyboardMetrics({ layoutHeight: 844, visibleHeight: 422, offsetTop: 0, scale: 2 })).toEqual(closed);
  });

  it("navegadores que redimensionam a janela junto com o teclado não precisam de ajuste", () => {
    // interactive-widget=resizes-content: o CSS normal (dvh, bottom: 0) já resolve.
    expect(keyboardMetrics({ layoutHeight: 508, visibleHeight: 508, offsetTop: 0, scale: 1 })).toEqual(closed);
    expect(keyboardMetrics({ layoutHeight: 500, visibleHeight: 508, offsetTop: 0, scale: 1 })).toEqual(closed);
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
