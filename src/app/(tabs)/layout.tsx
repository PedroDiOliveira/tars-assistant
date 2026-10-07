import type { ReactNode } from "react";
import { TabsShell } from "@/components/layout/app-shell";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return <TabsShell>{children}</TabsShell>;
}
