import katex from "katex";
import React from "react";

/**
 * Renders the mix of LaTeX and light markdown that upstream docstrings use:
 * $$display$$, $inline$, **bold** and `code`.
 *
 * Rendering happens at build time, so no KaTeX JavaScript ships to the browser
 * -- only its stylesheet.
 */

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: "html",
    });
  } catch {
    // A malformed statement should degrade to readable source, not blank space.
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline markdown within a non-math run. */
function renderInlineMarkup(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at > last) nodes.push(text.slice(last, at));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${index}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${index}`}
          className="bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em] text-ink"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = at + token.length;
    index++;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MathText({ children, className }: { children: string; className?: string }) {
  // Display math first so that its inner `$` are not treated as inline delimiters.
  const segments = children.split(/(\$\$[\s\S]*?\$\$)/g);

  const nodes: React.ReactNode[] = [];

  segments.forEach((segment, i) => {
    if (segment.startsWith("$$") && segment.endsWith("$$") && segment.length > 4) {
      nodes.push(
        <span
          key={`d${i}`}
          className="my-2 block"
          dangerouslySetInnerHTML={{ __html: renderTex(segment.slice(2, -2), true) }}
        />,
      );
      return;
    }

    const inlineParts = segment.split(/(\$[^$\n]+\$)/g);
    inlineParts.forEach((part, j) => {
      if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
        nodes.push(
          <span
            key={`i${i}-${j}`}
            dangerouslySetInnerHTML={{ __html: renderTex(part.slice(1, -1), false) }}
          />,
        );
      } else if (part) {
        nodes.push(
          <React.Fragment key={`t${i}-${j}`}>{renderInlineMarkup(part, `t${i}-${j}`)}</React.Fragment>,
        );
      }
    });
  });

  return <span className={className}>{nodes}</span>;
}
