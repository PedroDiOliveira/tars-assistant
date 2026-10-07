import { cn } from "cn";

/**
 * Marca do Tars.
 *
 * Quatro lâminas verticais idênticas, deslocadas umas em relação às outras: é o monólito
 * segmentado do robô que dá nome ao app, no instante em que se articula para andar.
 *
 * As alturas são iguais de propósito. Lâminas de alturas diferentes seriam lidas como barras de
 * um gráfico; iguais e deslocadas, lêem-se como um objeto em movimento. O conjunto é coeso (as
 * fendas são estreitas), então funciona como uma silhueta só até 18 px.
 *
 * Tudo herda `currentColor`, então a marca serve em qualquer fundo e nos dois temas.
 */

/** Topo de cada lâmina. A altura é a mesma para todas. */
const TOPS = [4.5, 1.5, 6.5, 3.5] as const;
const BLADE_WIDTH = 3.9;
const BLADE_HEIGHT = 24;
const GAP = 1.2;
const FIRST_X = 7.4;
const RADIUS = 1.4;

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={cn("size-7", className)}>
      {TOPS.map((top, i) => (
        <rect
          key={i}
          x={FIRST_X + i * (BLADE_WIDTH + GAP)}
          y={top}
          width={BLADE_WIDTH}
          height={BLADE_HEIGHT}
          rx={RADIUS}
        />
      ))}
    </svg>
  );
}

/** Marca completa para o topo da tela: símbolo + nome. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className="size-6 text-primary" />
      <span className="text-xl leading-none font-bold tracking-tight">Tars</span>
    </span>
  );
}
