import { Fragment } from "react";
import { cn } from "cn";
import { parseReplyText, type Inline } from "@/lib/reply-text";

function Spans({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold">
            {part.text}
          </strong>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Texto da resposta do assistente: parágrafos, negrito e listas. Só nós de texto do React: nada vira HTML. */
export function ReplyText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2 leading-relaxed", className)}>
      {parseReplyText(text).map((block, i) => {
        if (block.type === "text") {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 ? <br /> : null}
                  <Spans parts={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List
            key={i}
            className={cn("space-y-1 pl-5 marker:text-muted-foreground", block.ordered ? "list-decimal" : "list-disc")}
          >
            {block.items.map((item, j) => (
              <li key={j}>
                <Spans parts={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
