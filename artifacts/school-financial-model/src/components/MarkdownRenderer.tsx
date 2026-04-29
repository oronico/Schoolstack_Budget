import { useMemo, type JSX } from "react";

interface MarkdownRendererProps {
  content: string;
}

interface Block {
  type: "h2" | "h3" | "p" | "ul";
  content: string;
  items?: string[];
}

function parseMarkdown(md: string): Block[] {
  const lines = md.trim().split("\n");
  const blocks: Block[] = [];
  let currentList: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) {
        blocks.push({ type: "ul", content: "", items: currentList });
        currentList = null;
      }
      continue;
    }

    if (trimmed.startsWith("### ")) {
      if (currentList) {
        blocks.push({ type: "ul", content: "", items: currentList });
        currentList = null;
      }
      blocks.push({ type: "h3", content: trimmed.slice(4) });
    } else if (trimmed.startsWith("## ")) {
      if (currentList) {
        blocks.push({ type: "ul", content: "", items: currentList });
        currentList = null;
      }
      blocks.push({ type: "h2", content: trimmed.slice(3) });
    } else if (trimmed.startsWith("- ")) {
      if (!currentList) currentList = [];
      currentList.push(trimmed.slice(2));
    } else {
      if (currentList) {
        blocks.push({ type: "ul", content: "", items: currentList });
        currentList = null;
      }
      const last = blocks[blocks.length - 1];
      if (last && last.type === "p") {
        last.content += " " + trimmed;
      } else {
        blocks.push({ type: "p", content: trimmed });
      }
    }
  }

  if (currentList) {
    blocks.push({ type: "ul", content: "", items: currentList });
  }

  return blocks;
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-semibold text-[#1E293B]">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="prose prose-slate max-w-none">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                className="font-display text-2xl font-bold text-[#1E293B] mt-10 mb-4 first:mt-0"
              >
                {block.content}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="font-display text-lg font-bold text-[#1E293B] mt-8 mb-3"
              >
                {block.content}
              </h3>
            );
          case "p":
            return (
              <p
                key={i}
                className="text-[#1E293B]/75 leading-relaxed mb-4"
              >
                {renderInline(block.content)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-2 mb-5 pl-1">
                {block.items?.map((item, j) => (
                  <li
                    key={j}
                    className="flex items-start gap-3 text-[#1E293B]/75 leading-relaxed"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#328555] mt-2.5 shrink-0" />
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
