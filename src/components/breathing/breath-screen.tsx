"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { BREATH_PATTERNS, describeRhythm } from "@/domain/breathing";
import { hydrateBreathPrefs, useBreathPrefs } from "@/data";
import { createBreathAudio } from "./breath-audio";
import { BreathFace } from "./breath-face";
import { BreathGuide } from "./breath-guide";
import { leaveBreathing } from "./breath-origin";
import { BreathPatternPicker } from "./breath-pattern-picker";
import { useBreathSession, type BreathValues } from "./use-breath-session";
import { useWakeLock } from "./use-wake-lock";
import "./breathing.css";

/** Cor do topo do céu: vai para a barra de status enquanto a tela está aberta (onde o sistema respeita theme-color). */
const SKY_TOP = "#061712";

/** Estrelas fixas e determinísticas (mesmo desenho no servidor e no navegador): gradientes radiais numa camada só. */
function starLayer(seed: number, count: number): string {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const stars: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (random() * 100).toFixed(1);
    const y = (random() * 100).toFixed(1);
    const radius = (0.6 + random() * 0.9).toFixed(2);
    const alpha = (0.25 + random() * 0.5).toFixed(2);
    stars.push(`radial-gradient(circle ${radius}px at ${x}% ${y}%, rgb(233 246 222 / ${alpha}), transparent)`);
  }
  return stars.join(", ");
}

const STARS_NEAR = { backgroundImage: starLayer(7, 26) };
const STARS_FAR = { backgroundImage: starLayer(23, 34) };

/**
 * A barra de status acompanha o céu enquanto a tela está aberta, e volta ao tema do app ao sair. Uma meta PRÓPRIA no
 * início do <head> (vale a primeira que casa): as do Next são re-renderizadas na navegação e desfariam uma edição.
 */
function useStatusBarColor(color: string) {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    document.head.prepend(meta);
    return () => meta.remove();
  }, [color]);
}

/**
 * Respiração guiada: um respiro dentro do app. Poucos elementos de propósito: o personagem no centro (toque para
 * começar e para parar), a fase atual com a barra e, só enquanto está parado, o ritmo atual numa pílula que se
 * desdobra na escolha dos outros.
 */
export function BreathScreen() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const patternId = useBreathPrefs((s) => s.pattern);
  const sound = useBreathPrefs((s) => s.sound);
  const setPattern = useBreathPrefs((s) => s.setPattern);
  const setSound = useBreathPrefs((s) => s.setSound);
  const pattern = BREATH_PATTERNS[patternId];
  const [audio] = useState(createBreathAudio);
  const [picking, setPicking] = useState(false);

  // Cada quadro escreve as variáveis no elemento raiz: personagem, barra, órbitas e céu leem as mesmas.
  const session = useBreathSession((values: BreathValues) => {
    const style = rootRef.current?.style;
    if (style) {
      style.setProperty("--breath", values.breath.toFixed(4));
      style.setProperty("--inflow", values.inflow.toFixed(4));
      style.setProperty("--outflow", values.outflow.toFixed(4));
      style.setProperty("--presence", values.presence.toFixed(4));
      style.setProperty("--wave-1", values.waves[0].toFixed(4));
      style.setProperty("--wave-2", values.waves[1].toFixed(4));
      style.setProperty("--wave-3", values.waves[2].toFixed(4));
    }
    audio.update(values.breath, values.presence);
  });
  const { running } = session;

  useWakeLock(running);
  useStatusBarColor(SKY_TOP);

  useEffect(() => {
    void hydrateBreathPrefs();
  }, []);
  useEffect(() => () => audio.dispose(), [audio]);
  // Parar por qualquer motivo (inclusive ir para o segundo plano) também cala o som.
  useEffect(() => {
    if (!running) audio.stop();
  }, [running, audio]);

  function toggle() {
    if (running) {
      session.stop();
      return;
    }
    // O iOS só libera áudio dentro de um gesto: o som começa no mesmo toque que inicia a sessão.
    if (sound) audio.start();
    session.start(pattern);
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    if (next && running) audio.start();
    if (!next) audio.stop();
  }

  const exit = () => leaveBreathing(router);
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    // O seletor aberto trata o próprio Esc (e marca o evento); com ele aberto, Esc nunca tira a pessoa da tela.
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (picking) setPicking(false);
    else exit();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={rootRef}
      className="breath-screen dark"
      data-running={running ? "" : undefined}
      data-picking={picking ? "" : undefined}
    >
      <div className="breath-sky" aria-hidden="true">
        <div className="breath-stars breath-stars-far" style={STARS_FAR} />
        <div className="breath-stars breath-stars-near" style={STARS_NEAR} />
        <div className="breath-nebula" />
      </div>

      <h1 className="sr-only">Respiração guiada</h1>

      <div className="breath-top">
        <button type="button" onClick={exit} aria-label="Sair da respiração guiada" className="breath-icon-button">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={sound}
          aria-label="Som ambiente"
          className="breath-icon-button"
        >
          {sound ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
        </button>
      </div>

      <div className="breath-body">
        <div className="breath-stage">
          <BreathFace running={running} onToggle={toggle} />
        </div>

        <div className="breath-panel">
          <BreathGuide guide={session.guide} />
          <div className="breath-options" inert={running}>
            <BreathPatternPicker value={patternId} onChange={setPattern} open={picking} onOpenChange={setPicking} />
            <p className="breath-rhythm">{describeRhythm(pattern)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
