import type { ReactNode } from "react";
import { PageTitle } from "@/components/shared/page-title";
import { StudyTabs } from "@/components/studies/study-tabs";

export default function StudiesLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <PageTitle title="Estudos" />
      <div className="px-4 pb-4">
        <StudyTabs />
      </div>
      {children}
    </div>
  );
}
