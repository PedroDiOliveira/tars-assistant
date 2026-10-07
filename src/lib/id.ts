/**
 * UUID v4 gerado no cliente. Ele é a chave de idempotência das escritas: o banco faz
 * `INSERT ... ON CONFLICT (id) DO NOTHING`, então repetir o mesmo comando (toque duplo,
 * nova tentativa) nunca duplica um registro.
 *
 * Não usa `crypto.randomUUID`: ele só existe em contexto seguro, e o app também é aberto por
 * http://IP-da-rede no Safari do iPhone durante o desenvolvimento. `getRandomValues` existe lá.
 */
export function uid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // versão 4 e variante RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
