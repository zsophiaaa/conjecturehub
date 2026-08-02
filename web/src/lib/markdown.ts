import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Render user-submitted comment markdown to safe HTML.
 *
 * Uses `sanitize-html` (pure Node) instead of isomorphic-dompurify/jsdom, which
 * breaks on Vercel serverless with ERR_REQUIRE_ESM.
 */

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function renderCommentMarkdown(source: string): string {
  const rawHtml = marked.parse(source, { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "del",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "h3",
      "h4",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}
