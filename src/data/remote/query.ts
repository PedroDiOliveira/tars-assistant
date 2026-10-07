import { QueryClient } from "@tanstack/react-query";
import { isPublicPage } from "@/lib/routes";
import { alignClock } from "./clock";
import type { SnapshotPayload } from "./payload";

export const SNAPSHOT_KEY = ["snapshot"] as const;

/** Falha ao ler os dados do servidor. `status` distingue "sessão expirada" (401) de indisponibilidade. */
export class SnapshotError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SnapshotError";
  }
}

/**
 * Navegação com recarga completa da página, de propósito. Ao sair da conta ou perder a sessão, o estado em memória
 * (cache de dados, stores) tem de morrer junto; `router.push` manteria tudo isso vivo no navegador.
 */
export function goToLogin() {
  if (typeof window === "undefined") return;
  // Já numa página pública (login, redefinir senha): recarregar aqui causaria um loop de recarregamentos.
  if (isPublicPage(window.location.pathname)) return;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa é o objetivo
  window.location.assign("/login");
}

/** Lê o estado completo do usuário. Só roda no navegador: o servidor nunca guarda dados de usuário em cache global. */
export async function fetchSnapshot(): Promise<SnapshotPayload> {
  if (typeof window === "undefined") throw new SnapshotError("A leitura de dados só acontece no navegador.", 0);

  let response: Response;
  try {
    response = await fetch("/api/snapshot", { cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new SnapshotError("Sem conexão com o servidor.", 0);
  }

  if (response.status === 401) {
    goToLogin();
    throw new SnapshotError("Sua sessão expirou.", 401);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new SnapshotError(body?.message ?? "Não foi possível carregar seus dados.", response.status);
  }
  return alignClock((await response.json()) as SnapshotPayload, Date.now());
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Dados do dono mudam em outros aparelhos (cronômetro iniciado no celular): ao voltar ao app, se já
        // passaram 10 s, busca de novo. As próprias ações do app não dependem disto (atualizam o cache).
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (count, error) => !(error instanceof SnapshotError && error.status === 401) && count < 2,
      },
    },
  });
}

/** Instância única no navegador: as ações (fora do React) e o Provider precisam enxergar o MESMO cache. */
export const queryClient = createQueryClient();
