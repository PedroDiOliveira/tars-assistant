import type { ReactNode, SVGProps } from "react";

/**
 * Ícones próprios da água, no mesmo traço dos ícones lucide do app (24×24, linha de 1,75, pontas redondas) e na cor
 * do texto (`currentColor`). Existem para o seletor de porção: copo, garrafa e garrafa grande. O nível da água dentro
 * de cada um é um preenchimento suave da mesma cor. São decorativos: quem os usa dá o nome acessível.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Svg(props: IconProps & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Copo: a porção pequena. */
export function GlassIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 3.5h11.6l-1.3 15.9a2 2 0 0 1-2 1.8H9.5a2 2 0 0 1-2-1.8L6.2 3.5Z" />
      <path d="M6.9 11h10.2l-.65 8.2a1.4 1.4 0 0 1-1.4 1.3H8.95a1.4 1.4 0 0 1-1.4-1.3L6.9 11Z" fill="currentColor" fillOpacity={0.22} stroke="none" />
      <path d="M6.9 11h10.2" />
    </Svg>
  );
}

/** Garrafa: a porção do meio. */
export function BottleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2.5h4" />
      <path d="M10.2 2.5v3.3c0 .8-.5 1.3-1.2 1.9C7.9 8.6 7 9.6 7 11v8.2a2.3 2.3 0 0 0 2.3 2.3h5.4a2.3 2.3 0 0 0 2.3-2.3V11c0-1.4-.9-2.4-2-3.3-.7-.6-1.2-1.1-1.2-1.9V2.5" />
      <path d="M7 14h10v5.2a2.3 2.3 0 0 1-2.3 2.3H9.3A2.3 2.3 0 0 1 7 19.2V14Z" fill="currentColor" fillOpacity={0.22} stroke="none" />
      <path d="M7 14h10" />
    </Svg>
  );
}

/** Garrafa grande (1 L): corpo mais largo e alça. */
export function LargeBottleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 2h5" />
      <path d="M10 2v2.2c0 .6-.3 1-.8 1.4C7.2 7.1 5.6 8.4 5.6 10.8v8.4a2.3 2.3 0 0 0 2.3 2.3h8.2a2.3 2.3 0 0 0 2.3-2.3v-8.4c0-2.4-1.6-3.7-3.6-5.2-.5-.4-.8-.8-.8-1.4V2" />
      <path d="M5.6 12.5h12.8v6.7a2.3 2.3 0 0 1-2.3 2.3H7.9a2.3 2.3 0 0 1-2.3-2.3v-6.7Z" fill="currentColor" fillOpacity={0.22} stroke="none" />
      <path d="M5.6 12.5h12.8" />
      <path d="M18.4 10.2h.9a1.3 1.3 0 0 1 1.3 1.3v3.2a1.3 1.3 0 0 1-1.3 1.3h-.9" />
    </Svg>
  );
}

/** Gota cheia: o botão do contador. Preenche com a cor do texto; um brilho discreto dá volume. */
export function DropShape(props: IconProps) {
  return (
    <svg viewBox="0 0 64 76" aria-hidden focusable="false" {...props}>
      <path
        d="M32 3C21.4 17.4 8 29.6 8 46.6 8 61.7 18.8 73 32 73s24-11.3 24-26.4C56 29.6 42.6 17.4 32 3Z"
        fill="currentColor"
      />
      <path d="M20.4 32.5c1-4 3.2-7 6.2-9.6" fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** Copo/garrafa/garrafa grande, na ordem dos três botões do seletor. */
export const PORTION_ICONS = [GlassIcon, BottleIcon, LargeBottleIcon] as const;

/** Nome falado de cada porção (leitor de tela e rótulos). */
export const PORTION_NAMES = ["Copo", "Garrafa", "Garrafa grande"] as const;
