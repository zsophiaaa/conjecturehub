import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

/**
 * Render user-submitted comment markdown to safe HTML.
 *
 * Comments are the one place on the site where untrusted text becomes markup,
 * so this is a security boundary: we render markdown, then run the result
 * through DOMPurify with a deliberately small allowlist. No raw HTML in the
 * source survives (marked is configured not to pass it through, and DOMPurify
 * strips anything that slips past), so there is no path to script injection.
 *
 * Math is intentionally NOT rendered here. Rendering KaTeX over sanitized HTML
 * would reintroduce an injection surface; comments show `$...$` verbatim for now.
 */

marked.setOptions({
  gfm: true,
  breaks: true,
});

const ALLOWED_TAGS = [
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
];

const ALLOWED_ATTR = ["href", "title"];

export function renderCommentMarkdown(source: string): string {
  const rawHtml = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force links to open safely and never carry a javascript: scheme.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
    ADD_ATTR: ["target", "rel"],
  });
}

export const COMMENT_MAX_LENGTH = 5000;
export const COMMENT_MIN_LENGTH = 2;
