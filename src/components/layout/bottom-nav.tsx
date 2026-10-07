"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, GraduationCap, House, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  module: string;
}

const ITEMS: NavItem[] = [
  { href: "/inicio", label: "Início", icon: House, module: "primary" },
  { href: "/financas", label: "Finanças", icon: Wallet, module: "finance" },
  { href: "/treino", label: "Treino", icon: Dumbbell, module: "workout" },
  { href: "/estudos", label: "Estudos", icon: GraduationCap, module: "study" },
];

/** Barra inferior fixa com 4 itens e rótulos; respeita a área segura do iPhone. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40"
    >
      <div className="mx-auto max-w-md border-t bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="grid grid-cols-4">
          {ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href} data-module={item.module}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-16 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-xs"
                >
                  <span
                    className={cn(
                      "grid h-8 w-14 place-items-center rounded-full transition-colors",
                      active ? "bg-m-soft text-m-ink" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-6" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  </span>
                  <span className={cn(active ? "font-semibold text-foreground" : "text-muted-foreground")}>
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
