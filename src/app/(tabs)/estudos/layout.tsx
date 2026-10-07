import type { ReactNode } from "react";
import { StudyTabs } from "@/components/studies/study-tabs";

export default function StudiesLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="space-y-4 px-4 pt-1 pb-5">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Estudos</h1>
        <StudyTabs />
      </div>
      {children}
    </div>
  );
}
