"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  BREATH_PATTERN_IDS,
  BREATH_PATTERNS,
  breathFrame,
  cycleMs,
  describeRhythm,
  LEAD_IN_MS,
  type BreathPattern,
  type BreathPatternId,
} from "@/domain/breathing";

const SPARK_W = 46;
const SPARK_H = 18;
const SPARK_PAD = 2;

/** Um ciclo do padrão em miniatura: o mesmo nível de ar que anima a bolinha, amostrado do começo ao fim. */
function cyclePath(pattern: BreathPattern): string {
  const steps = 64;
  const length = cycleMs(pattern);
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const level = breathFrame(pattern, LEAD_IN_MS + (length * i) / steps).level;
    const x = SPARK_PAD + ((SPARK_W - 2 * SPARK_PAD) * i) / steps;
    const y = SPARK_PAD + (SPARK_H - 2 * SPARK_PAD) * (1 - level);
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${points.join("L")}`;
}

const CYCLE_PATHS = Object.fromEntries(BREATH_PATTERN_IDS.map((id) => [id, cyclePath(BREATH_PATTERNS[id])])) as Record<
  BreathPatternId,
  string
>;

interface BreathPatternPickerProps {
  value: BreathPatternId;
  onChange: (value: BreathPatternId) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Escolha do ritmo, escondida por padrão: só a pílula com o ritmo atual. Tocar nela a desdobra para cima num cartão
 * com os quatro (cada um com o desenho do próprio ciclo), e escolher um a dobra de volta com o nome novo.
 *
 * Pílula e cartão são O MESMO elemento: o cartão está sempre montado e um `clip-path` mostra só a região da pílula
 * quando fechado. Abrir e fechar é só a transição desse recorte, então a pílula "vira" o cartão sem troca de
 * elemento. O recorte também limita o toque: fechado, só a pílula responde. A largura da pílula é medida (muda com o
 * nome) e vai para `--pill-w`.
 *
 * Teclado: setas abrem; dentro da lista, setas/Home/End movem o foco, Enter ou espaço escolhem, Esc fecha (sem sair da
 * tela) e o foco volta para a pílula. Tocar fora (no véu) ou o foco sair do cartão também fecha.
 */
export function BreathPatternPicker({ value, onChange, open, onOpenChange }: BreathPatternPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = BREATH_PATTERN_IDS.indexOf(value);
  const pattern = BREATH_PATTERNS[value];

  useLayoutEffect(() => {
    const root = rootRef.current;
    const pill = pillRef.current;
    if (!root || !pill) return;
    const write = () => root.style.setProperty("--pill-w", `${pill.offsetWidth}px`);
    write();
    const observer = new ResizeObserver(write);
    observer.observe(pill);
    return () => observer.disconnect();
  }, []);

  // O destaque desliza até o ritmo escolhido (posição e altura medidas: as linhas têm alturas diferentes).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const option = optionRefs.current[selectedIndex];
      if (!option) return;
      list.style.setProperty("--sel-y", `${option.offsetTop}px`);
      list.style.setProperty("--sel-h", `${option.offsetHeight}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [selectedIndex]);

  // Ao abrir, o foco vai para o ritmo atual (a lista deixou de ser `inert` neste commit). Só na abertura: trocar de
  // ritmo com o cartão aberto não puxa o foco.
  const focusSelected = useEffectEvent(() => optionRefs.current[selectedIndex]?.focus({ preventScroll: true }));
  useEffect(() => {
    if (open) focusSelected();
  }, [open]);

  /** Fecha; se o foco estava no cartão, devolve-o à pílula ANTES de a lista virar `inert` (senão ele cairia no body). */
  function close() {
    if (surfaceRef.current?.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true });
    onOpenChange(false);
  }

  function choose(id: BreathPatternId) {
    if (id !== value) onChange(id);
    close();
  }

  function onSurfaceKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        onOpenChange(true);
      }
      return;
    }
    if (event.key === "Escape") {
      // Marca como tratada: a tela não sai da respiração por causa deste Esc.
      event.preventDefault();
      close();
      return;
    }
    const options = optionRefs.current.filter((option): option is HTMLButtonElement => option !== null);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index < 0 ? options.length - 1 : index - 1,
      Home: 0,
      End: options.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    options[(target + options.length) % options.length]?.focus({ preventScroll: true });
  }

  return (
    <div ref={rootRef} className="breath-picker" data-open={open ? "" : undefined}>
      <div className="breath-picker-scrim" aria-hidden="true" onClick={close} />
      <div
        ref={surfaceRef}
        className="breath-picker-surface"
        onKeyDown={onSurfaceKeyDown}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (open && next instanceof Node && !event.currentTarget.contains(next)) onOpenChange(false);
        }}
      >
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Ritmo da respiração"
          className="breath-picker-list"
          inert={!open}
        >
          <span className="breath-picker-highlight" aria-hidden="true" />
          {BREATH_PATTERN_IDS.map((id, i) => {
            const option = BREATH_PATTERNS[id];
            const selected = id === value;
            return (
              <button
                key={id}
                ref={(node) => {
                  optionRefs.current[i] = node;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                aria-labelledby={`${listId}-${id}-name`}
                aria-describedby={`${listId}-${id}-about`}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(id)}
                className="breath-picker-option"
                // de baixo para cima: o cartão se desdobra a partir da pílula
                style={{ "--i": BREATH_PATTERN_IDS.length - 1 - i } as CSSProperties}
              >
                <span className="breath-picker-option-text">
                  <span id={`${listId}-${id}-name`} className="breath-picker-option-name">
                    {option.name}
                  </span>
                  <span id={`${listId}-${id}-about`} className="breath-picker-option-note">
                    <span className="sr-only">{describeRhythm(option)}. </span>
                    {option.note}
                  </span>
                </span>
                <svg
                  className="breath-picker-spark"
                  viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                  width={SPARK_W}
                  height={SPARK_H}
                  aria-hidden="true"
                >
                  <path d={CYCLE_PATHS[id]} />
                </svg>
              </button>
            );
          })}
        </div>
        <button
          ref={triggerRef}
          type="button"
          className="breath-picker-trigger"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          onClick={() => (open ? close() : onOpenChange(true))}
        >
          <span ref={pillRef} className="breath-picker-pill">
            <span className="sr-only">Ritmo: </span>
            <span key={value} className="breath-picker-name">
              {pattern.name}
            </span>
            <ChevronDown className="breath-picker-chevron" aria-hidden />
          </span>
        </button>
      </div>
    </div>
  );
}
