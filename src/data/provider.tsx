"use client";

import type { ReactNode } from "react";
import { IS_LIVE } from "@/lib/app-mode";
import { RemoteDataProvider } from "./remote/provider";

/** No modo real envolve o app com o cache de dados do servidor; no demo não há nada a prover. */
export function DataProvider({ children }: { children: ReactNode }) {
  return IS_LIVE ? <RemoteDataProvider>{children}</RemoteDataProvider> : <>{children}</>;
}
