"use client";

import { useEffect } from "react";
import { KEYBOARD_EVENT, keyboardInset } from "@/lib/keyboard";

/**
 * Acompanha o teclado virtual e o publica no `<html>`, para o CSS poder reagir (nada aqui renderiza):
 *
 * - `--kb-inset`: quanto o teclado cobre do fim da janela (0px sem teclado). Elementos fixos embaixo usam como `bottom`.
 * - `--vv-height`: altura da parte visível; só existe com o teclado aberto. O sheet limita a própria altura a ela.
 * - `data-keyboard`: presente com o teclado aberto. Some com a área segura de baixo (o teclado já a cobre).
 *
 * Em seguida dispara `KEYBOARD_EVENT`, que os sheets usam para rolar até o campo em foco.
 */
export function KeyboardInsetSync() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    let lastInset = -1;
    let lastHeight = -1;

    const apply = () => {
      frame = 0;
      const inset = keyboardInset({
        layoutHeight: window.innerHeight,
        visibleHeight: viewport.height,
        offsetTop: viewport.offsetTop,
        scale: viewport.scale,
      });
      const height = Math.round(viewport.height);
      if (inset === lastInset && (inset === 0 || height === lastHeight)) return;
      lastInset = inset;
      lastHeight = height;

      if (inset > 0) {
        root.style.setProperty("--kb-inset", `${inset}px`);
        root.style.setProperty("--vv-height", `${height}px`);
        root.setAttribute("data-keyboard", "");
      } else {
        root.style.removeProperty("--kb-inset");
        root.style.removeProperty("--vv-height");
        root.removeAttribute("data-keyboard");
      }
      window.dispatchEvent(new Event(KEYBOARD_EVENT));
    };
    // Vários eventos por quadro (o iOS manda `scroll` e `resize` juntos): um cálculo só.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    schedule();
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--vv-height");
      root.removeAttribute("data-keyboard");
    };
  }, []);

  return null;
}
