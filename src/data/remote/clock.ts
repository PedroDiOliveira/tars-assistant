import type { SnapshotPayload } from "./payload";

/**
 * O cronômetro guarda instantes do relógio do SERVIDOR (é ele quem decide a duração). Para exibir o tempo
 * decorrido com `Date.now()` do aparelho, trazemos esses instantes para o relógio local: o aparelho pode estar
 * adiantado ou atrasado em minutos (relógio manual, fuso errado) e o cronômetro não pode mostrar -3:00 nem +3:00.
 *
 * `serverNow` = relógio do servidor no instante da resposta; a diferença para `clientNowMs` (relógio local no
 * mesmo instante, ignorando a latência de rede) é o desvio.
 */
export function alignClock(payload: SnapshotPayload, clientNowMs: number): SnapshotPayload {
  const { timer } = payload.data;
  if (!timer) return payload;
  const offset = payload.serverNow - clientNowMs;
  return {
    ...payload,
    data: {
      ...payload.data,
      timer: {
        ...timer,
        startedAt: timer.startedAt - offset,
        runningSince: timer.runningSince === null ? null : timer.runningSince - offset,
      },
    },
  };
}
