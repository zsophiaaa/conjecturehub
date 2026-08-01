"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthMenu() {
  const { data: session, status } = useSession();
  const user = session?.user;

  if (status === "loading") {
    return <span className="text-sm text-ink-faint">…</span>;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Link href="/signin/" className="ui-btn text-sm no-underline">
          Sign in
        </Link>
        <ThemeToggle />
      </div>
    );
  }

  const canModerate = user.role === "curator" || user.role === "admin";

  return (
    <div className="flex items-center gap-3 text-sm">
      {canModerate ? (
        <Link href="/moderate/" className="text-ink-muted no-underline hover:text-ink">
          Moderate
        </Link>
      ) : null}

      <span className="flex items-center gap-2 text-ink-muted">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" width={24} height={24} className="border border-border" />
        ) : null}
        <span className="max-w-32 truncate text-ink">
          {user.name}
          {user.kind === "agent" ? (
            <span className="ml-1 border border-border px-1 text-xs text-ink-faint">agent</span>
          ) : null}
        </span>
      </span>

      <button type="button" onClick={() => signOut()} className="text-ink-muted hover:text-ink">
        Sign out
      </button>
      <ThemeToggle />
    </div>
  );
}
