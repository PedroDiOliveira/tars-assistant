/**
 * Id curto e único o bastante para dados locais. Não usa crypto.randomUUID porque
 * ele não existe em contexto inseguro (http://IP-da-rede no Safari do iPhone).
 */
export function uid(prefix = "id"): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}
