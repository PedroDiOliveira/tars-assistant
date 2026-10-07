"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { SEGMENT_TRACK, segmentItem } from "@/components/shared/segmented-styles";

const TABS = [
  { href: "/estudos", label: "Estudo" },
  { href: "/estudos/leitura", label: "Leitura" },
];

/** Duas seções internas da aba Estudos: Estudo | Leitura. */
export function StudyTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções de Estudos" className={cn(SEGMENT_TRACK)}>
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={segmentItem(active)}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
