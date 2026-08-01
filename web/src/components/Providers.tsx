"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client providers mounted once at the root. SessionProvider makes the Auth.js
 * session available to `useSession()` in any client component (the header menu,
 * the community comment/tag forms) without each one refetching it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
