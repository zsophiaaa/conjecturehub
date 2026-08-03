"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Without this a thrown error in any route segment takes the whole page to
 * Next's default screen, which in production is a blank white box.
 *
 * The digest is shown deliberately: it is the only handle a reader has when
 * reporting the fault, and the message itself is withheld by the framework in
 * production anyway.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl text-ink sm:text-4xl">Something broke</h1>
      <p className="mt-4 text-ink-2">
        This page failed to render. Nothing you did caused it and nothing was lost.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-sm text-ink-3">
          Reference <span className="text-ink-2">{error.digest}</span>
        </p>
      )}
      <p className="mt-6 flex flex-wrap gap-4">
        <button type="button" onClick={reset} className="underline">
          Try again
        </button>
        <Link href="/conjectures/">Browse the index</Link>
      </p>
    </div>
  );
}
