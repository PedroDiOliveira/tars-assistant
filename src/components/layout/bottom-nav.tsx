"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, Dumbbell, House, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { href: "/inicio", label: "Início", icon: House },
  { href: "/financas", label: "Finanças", icon: Wallet },
  { href: "/treino", label: "Treino", icon: Dumbbell },
  { href: "/estudos", label: "Estudos", icon: BookOpenText },
];

/**
 * Barra flutuante só de ícones, com vidro (desfoque do conteúdo por trás).
 *
 * A marcação do item ativo é **uma única pílula** que desliza até o item escolhido, em vez de
 * sumir de um e aparecer no outro. Como os quatro itens têm a mesma largura, a posição é
 * `translateX(índice × 100%)` — sem medir nada no DOM, então não há salto na primeira pintura
 * nem recálculo ao girar a tela.
 *
 * O destino é marcado já no toque, sem esperar a navegação resolver: senão a pílula ficaria
 * parada por um instante e o movimento pareceria travado.
 */
export function BottomNav() {
  const pathname = usePathname();
  const routeIndex = ITEMS.findIndex(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  // Destino escolhido no toque, válido só enquanto a rota ainda é a de origem: assim que a
  // navegação chega, o pathname muda e o valor derivado volta sozinho para a rota real.
  const [tap, setTap] = useState<{ index: number; from: string } | null>(null);
  const activeIndex = tap && tap.from === pathname ? tap.index : routeIndex;

  return (
    <nav
      aria-label="Navegação principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-md px-6">
        <ul
          className={cn(
            "pointer-events-auto relative flex items-center rounded-full p-2",
            // Vidro: desfoque moderado (um blur grande demais vira mancha e esconde o fundo),
            // pouco pigmento e saturação alta. Sem backdrop-filter, cai para fundo opaco legível.
            "bg-card/85 backdrop-blur-md backdrop-saturate-200 supports-backdrop-filter:bg-card/25",
            // brilho de borda, como o vidro do iOS
            "ring-1 ring-white/40 dark:ring-white/12",
            "shadow-[0_10px_40px_-10px_rgb(8_71_52/0.35)]",
            "dark:supports-backdrop-filter:bg-card/25",
          )}
        >
          {/* Pílula deslizante: fica atrás dos ícones e persegue o item ativo. */}
          <span
            aria-hidden
            className={cn(
              "absolute top-2 bottom-2 left-2 w-[calc((100%-1rem)/4)] rounded-full bg-primary",
              "transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              "motion-reduce:transition-none",
              activeIndex < 0 && "opacity-0",
            )}
            style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
          />

          {ITEMS.map((item, index) => {
            const active = index === activeIndex;
            const Icon = item.icon;
            return (
              <li key={item.href} className="relative min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setTap({ index, from: pathname })}
                  className={cn(
                    "flex min-h-12 items-center justify-center rounded-full",
                    "transition-colors duration-300 motion-reduce:transition-none",
                    active ? "text-primary-foreground" : "text-foreground/70",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-6 transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                      "motion-reduce:transition-none",
                      active && "scale-110",
                    )}
                    strokeWidth={active ? 2.3 : 1.9}
                    aria-hidden
                  />
                  <span className="sr-only">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
