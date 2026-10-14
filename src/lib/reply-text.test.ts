import { describe, expect, it } from "vitest";
import { parseReplyText, type Inline, type ReplyBlock } from "./reply-text";

const plain = (text: string): Inline => ({ text, bold: false });
const bold = (text: string): Inline => ({ text, bold: true });

describe("parseReplyText", () => {
  it("devolve nada para texto vazio ou só espaços", () => {
    expect(parseReplyText("")).toEqual([]);
    expect(parseReplyText("  \n \n")).toEqual([]);
  });

  it("mantém as quebras de linha dentro do parágrafo e separa parágrafos por linha em branco", () => {
    expect(parseReplyText("Sua semana:\nMusculação: 2 treinos.\n\nFim.")).toEqual<ReplyBlock[]>([
      { type: "text", lines: [[plain("Sua semana:")], [plain("Musculação: 2 treinos.")]] },
      { type: "text", lines: [[plain("Fim.")]] },
    ]);
  });

  it("separa o negrito, e ** sem par continua como texto", () => {
    expect(parseReplyText("Você gastou **R$ 42,00** em Alimentação")).toEqual<ReplyBlock[]>([
      { type: "text", lines: [[plain("Você gastou "), bold("R$ 42,00"), plain(" em Alimentação")]] },
    ]);
    expect(parseReplyText("sobrou ** solto")).toEqual<ReplyBlock[]>([{ type: "text", lines: [[plain("sobrou ** solto")]] }]);
  });

  it("reconhece listas com marcador e numeradas, sem confundir negrito com marcador", () => {
    expect(parseReplyText("- um\n* dois\n• três\n**Resumo** final")).toEqual<ReplyBlock[]>([
      { type: "list", ordered: false, items: [[plain("um")], [plain("dois")], [plain("três")]] },
      { type: "text", lines: [[bold("Resumo"), plain(" final")]] },
    ]);
    expect(parseReplyText("1. a\n2) **b**")).toEqual<ReplyBlock[]>([
      { type: "list", ordered: true, items: [[plain("a")], [bold("b")]] },
    ]);
  });

  it("troca de lista numerada para com marcador abre outra lista", () => {
    const blocks = parseReplyText("1. a\n- b");
    expect(blocks).toHaveLength(2);
  });

  it("título vira linha em negrito", () => {
    expect(parseReplyText("### Finanças\nTudo certo.")).toEqual<ReplyBlock[]>([
      { type: "text", lines: [[bold("Finanças")], [plain("Tudo certo.")]] },
    ]);
  });

  it("tabela vira linhas 'a · b' e a linha separadora some", () => {
    expect(parseReplyText("| Categoria | Valor |\n|---|:---:|\n| Alimentação | R$ 10,00 |")).toEqual<ReplyBlock[]>([
      { type: "text", lines: [[plain("Categoria · Valor")], [plain("Alimentação · R$ 10,00")]] },
    ]);
  });

  it("link vira só o texto e o endereço do modelo é descartado", () => {
    const [block] = parseReplyText("Veja [aqui](https://evil.example/x) e ![img](https://evil.example/p.png)");
    expect(block).toEqual({ type: "text", lines: [[plain("Veja aqui e img")]] });
    expect(JSON.stringify(block)).not.toContain("evil.example");
  });

  it("crases perdem o marcador", () => {
    expect(parseReplyText("use `get_summary`")).toEqual<ReplyBlock[]>([{ type: "text", lines: [[plain("use get_summary")]] }]);
  });

  it("HTML cru fica como texto literal (quem renderiza escapa)", () => {
    expect(parseReplyText("<img src=x onerror=alert(1)> <b>oi</b>")).toEqual<ReplyBlock[]>([
      { type: "text", lines: [[plain("<img src=x onerror=alert(1)> <b>oi</b>")]] },
    ]);
  });

  it("aceita CRLF", () => {
    expect(parseReplyText("a\r\nb")).toEqual<ReplyBlock[]>([{ type: "text", lines: [[plain("a")], [plain("b")]] }]);
  });
});
