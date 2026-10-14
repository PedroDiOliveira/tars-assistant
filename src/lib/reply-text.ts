/**
 * Texto da resposta do assistente -> blocos para a tela. Um "markdown-lite" próprio, de propósito: o que o modelo
 * escreve é entrada não confiável, então nada vira HTML, link nem imagem. Só existem parágrafos, negrito e listas;
 * o resto degrada para texto simples. Quem renderiza usa nós de texto do React, que já escapam tudo.
 */

export interface Inline {
  text: string;
  bold: boolean;
}

export type ReplyBlock =
  /** linhas seguidas do mesmo parágrafo: a quebra de linha é preservada */
  | { type: "text"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^[\s|:-]+$/;

/** Links viram só o texto (o endereço vindo do modelo nunca é usado) e `código` perde as crases. */
function simplify(raw: string): string {
  return raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1");
}

function inlines(raw: string): Inline[] {
  // `split` com grupo de captura: os índices ímpares são o que estava entre ** **. ** sem par fica como texto.
  return simplify(raw)
    .split(/\*\*(.+?)\*\*/g)
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}

function tableLine(row: string): Inline[] | null {
  if (TABLE_RULE.test(row) && row.includes("-")) return null; // linha "|---|---|"
  const cells = row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => simplify(cell).replace(/\*\*/g, "").trim())
    .filter((cell) => cell !== "");
  return cells.length === 0 ? null : [{ text: cells.join(" · "), bold: false }];
}

export function parseReplyText(text: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  let open: ReplyBlock | null = null;

  const pushLine = (line: Inline[]) => {
    if (line.every((part) => part.text === "")) return;
    if (open?.type === "text") open.lines.push(line);
    else blocks.push((open = { type: "text", lines: [line] }));
  };
  const pushItem = (ordered: boolean, item: Inline[]) => {
    if (open?.type === "list" && open.ordered === ordered) open.items.push(item);
    else blocks.push((open = { type: "list", ordered, items: [item] }));
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      open = null;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      pushLine([{ text: simplify(heading[1]).replace(/\*\*/g, "").trim(), bold: true }]);
      continue;
    }
    if (TABLE_ROW.test(line)) {
      const row = tableLine(line);
      if (row) pushLine(row);
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      pushItem(false, inlines(bullet[1]));
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      pushItem(true, inlines(numbered[1]));
      continue;
    }
    pushLine(inlines(line.trim()));
  }
  return blocks;
}
