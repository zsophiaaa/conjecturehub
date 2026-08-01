import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root; otherwise Next walks up and can latch onto an
  // unrelated lockfile in a parent directory.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  // The conjecture corpus is still read from .generated/corpus.json at build
  // time and those pages remain statically generated. We dropped `output:
  // "export"` so the app can also run server code at request time — auth, the
  // community API routes, and the curator moderation queue. See docs/COMMUNITY.md.
  images: { unoptimized: true },
  trailingSlash: true,
};

export default config;
