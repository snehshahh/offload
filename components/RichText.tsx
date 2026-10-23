import Link from "next/link";
import { Fragment } from "react";
import { APP_URL } from "@/lib/site";
import type { Block } from "@/lib/posts";

const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Renders [links](/path), **bold** and `code` inside a line of post text. */
function Inline({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = m.index;
    if (m[1]) {
      const href = m[2] === "app" ? APP_URL : m[2];
      out.push(
        href.startsWith("/") ? (
          <Link key={key} href={href}>
            {m[1]}
          </Link>
        ) : (
          <a key={key} href={href}>
            {m[1]}
          </a>
        ),
      );
    } else if (m[3]) {
      out.push(<b key={key}>{m[3]}</b>);
    } else {
      out.push(<code key={key}>{m[4]}</code>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}

export function PostBody({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if ("h2" in b) return <h2 key={i}>{b.h2}</h2>;
        if ("p" in b) return <p key={i}><Inline text={b.p} /></p>;
        if ("note" in b) return <p key={i} className="note"><Inline text={b.note} /></p>;
        const items = "ul" in b ? b.ul : b.ol;
        const List = "ul" in b ? "ul" : "ol";
        return (
          <List key={i}>
            {items.map((t, j) => (
              <li key={j}>
                <Inline text={t} />
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}
