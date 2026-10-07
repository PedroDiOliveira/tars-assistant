import { toast } from "sonner";
import type { Result, Success } from "@/data";

/**
 * Mostra o resultado de uma ação ao usuário: erro sempre; sucesso só se uma mensagem for dada.
 * Estreita o tipo, então depois de `if (!notify(result)) return;` o `result.value` está disponível.
 * Aceita também a união de resultados de ramos diferentes (ex.: atualizar OU criar).
 *
 * O aviso de sucesso só aparece depois que a ação terminou (no modo real, depois que o servidor
 * confirmou): a spec proíbe indicar sucesso sem persistência.
 */
export function notify<R extends Result<unknown>>(
  result: R,
  success?: string | ((value: Extract<R, { ok: true }>["value"]) => string),
): result is Extract<R, Success<unknown>> {
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  if (success) toast.success(typeof success === "function" ? success((result as Extract<R, { ok: true }>).value) : success);
  return true;
}
