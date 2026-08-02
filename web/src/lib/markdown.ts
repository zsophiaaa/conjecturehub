import { marked } from "marked";

/**
 * Render user-submitted comment markdown to safe HTML.
 *
 * DOMPurify is loaded lazily: `isomorphic-dompurify` pulls in jsdom and breaks
 * some Vercel serverless bundles if imported at module scope.
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

type Purify = typeof import("isomorphic-dompurify").default;
let purifyPromise: Promise<Purify> | null = null;

async function getPurify(): Promise<Purify> {
  purifyPromise ??= import("isomorphic-dompurify").then((m) => m.default);
  return purifyPromise;
}

export async function renderCommentMarkdown(source: string): Promise<string> {
  const rawHtml = marked.parse(source, { async: false }) as string;
  const DOMPurify = await getPurify();
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
    ADD_ATTR: ["target", "rel"],
  });
}
