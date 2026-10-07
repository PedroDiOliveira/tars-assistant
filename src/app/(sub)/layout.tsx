import type { ReactNode } from "react";
import { SubShell } from "@/components/layout/app-shell";

export default function SubLayout({ children }: { children: ReactNode }) {
  return <SubShell>{children}</SubShell>;
}
