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
 * Barra flutuante: descolada das bordas, cantos arredondados e fundo translúcido com blur,
 * para o conteúdo aparecer desfocado por trás. O item ativo ganha uma "pílula" preenchida.
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-md px-4">
        <ul
          className={cn(
            "pointer-events-auto flex items-center justify-between gap-1 rounded-full p-1.5",
            "bg-card/70 backdrop-blur-2xl backdrop-saturate-150",
            "shadow-[0_8px_32px_-8px_rgb(8_71_52/0.28)] ring-1 ring-foreground/8",
            "dark:bg-card/60 dark:ring-white/10",
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
                    "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-2 transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  <span className={cn("text-[11px] leading-none", active && "font-semibold")}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
