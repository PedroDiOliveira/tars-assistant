"use client";

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
 * Barra flutuante só de ícones: descolada das bordas, arredondada e com vidro bem translúcido
 * (fundo pouco opaco + blur forte + saturação alta), para o conteúdo aparecer desfocado atrás.
 * O rótulo continua no HTML como texto para leitores de tela.
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-md px-6">
        <ul
          className={cn(
            "pointer-events-auto flex items-center justify-between gap-1 rounded-full p-2",
            // Vidro: desfoque moderado (um blur grande demais vira mancha e esconde o fundo),
            // pouco pigmento e saturação alta. Sem backdrop-filter, cai para fundo opaco legível.
            "bg-card/85 backdrop-blur-md backdrop-saturate-200 supports-backdrop-filter:bg-card/25",
            // brilho de borda, como o vidro do iOS
            "ring-1 ring-white/40 dark:ring-white/12",
            "shadow-[0_10px_40px_-10px_rgb(8_71_52/0.35)]",
            "dark:supports-backdrop-filter:bg-card/25",
          )}
        >
          {ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center justify-center rounded-full transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-foreground/60",
                  )}
                >
                  <Icon className="size-6" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
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
