"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { hydrateDraft } from "./draft-store";
import { queryClient } from "./query";

/** Cache de dados do modo real + carga do treino em andamento guardado neste aparelho. */
export function RemoteDataProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void hydrateDraft();
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
