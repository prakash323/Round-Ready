import type { ReactNode } from "react";

/**
 * A small Markdown renderer.
 *
 * It parses into React elements and never produces an HTML string, so
 * `dangerouslySetInnerHTML` appears nowhere and injection is impossible by
 * construction rather than by sanitising. That is the whole reason for
 * writing it rather than pulling in a parser plus a sanitiser: a note
 * containing a script tag renders as the words "script tag", and no
 * allowlist has to be maintained to keep it that way.
 *
 * It supports what someone taking revision notes actually uses — headings,
 * lists, fenced code, inline code, bold, italic and links — and silently
 * treats anything else as text, which is the right failure for a note editor.
 */

type Inline =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "link"; value: string; href: string };

/**
 * Inline spans, matched in one pass.
 *
 * Code is first in the alternation on purpose: backticks win over asterisks,
 * so `**not bold**` inside code stays literal, which is what someone writing
 * about Markdown expects.
 */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: "text", value: text.slice(last, at) });
    const token = match[0];

    if (token.startsWith("`")) {
      out.push({ kind: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("**")) {
      out.push({ kind: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("*")) {
      out.push({ kind: "italic", value: token.slice(1, -1) });
    } else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      // Only http(s). A "javascript:" href in a note would be a link the
      // student clicks in their own notebook, which is how a note editor
      // becomes an attack on its own author.
      const safe = /^https?:\/\//i.test(href);
      if (safe) out.push({ kind: "link", value: label, href });
      else out.push({ kind: "text", value: token });
    }
    last = at + token.length;
  }

  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

function renderInline(spans: Inline[]): ReactNode[] {
  return spans.map((span, i) => {
    switch (span.kind) {
      case "code":
        return (
          <code key={i} className="rounded bg-edge/60 px-1 py-0.5 font-mono text-[0.85em]">
            {span.value}
          </code>
        );
      case "bold":
        return (
          <strong key={i} className="font-semibold">
            {span.value}
          </strong>
        );
      case "italic":
        return <em key={i}>{span.value}</em>;
      case "link":
        return (
          <a
            key={i}
            href={span.href}
            target="_blank"
            rel="noreferrer"
            className="link underline underline-offset-2"
          >
            {span.value}
          </a>
        );
      default:
        return <span key={i}>{span.value}</span>;
    }
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];

  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code. Everything up to the closing fence is literal, including
    // anything that would otherwise look like Markdown.
    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // past the closing fence
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg border border-edge bg-canvas p-3 font-mono text-xs leading-relaxed"
        >
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const content = renderInline(parseInline(heading[2]));
      const size = ["text-lg", "text-base", "text-sm", "text-sm"][depth - 1];
      blocks.push(
        <p key={key++} className={`mt-4 font-semibold first:mt-0 ${size}`} role="heading" aria-level={depth}>
          {content}
        </p>,
      );
      i += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="mt-2 list-disc space-y-1 pl-5">
          {items.map((item, n) => (
            <li key={n}>{renderInline(parseInline(item))}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="mt-2 list-decimal space-y-1 pl-5">
          {items.map((item, n) => (
            <li key={n}>{renderInline(parseInline(item))}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```")
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="mt-2 leading-relaxed first:mt-0">
        {renderInline(parseInline(para.join(" ")))}
      </p>,
    );
  }

  if (blocks.length === 0) {
    return <p className="text-sm italic text-faint">This note is empty.</p>;
  }

  return <div className="text-sm text-ink">{blocks}</div>;
}
