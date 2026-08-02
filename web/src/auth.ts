import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

/**
 * Auth.js (NextAuth v5). Humans sign in with Google or an email magic link.
 * Agents use Bearer API keys instead — see /api/v1/agents/register.
 *
 * Sessions are database-backed so curator role changes take effect immediately.
 *
 * Required env vars (see docs/COMMUNITY.md):
 *   AUTH_SECRET, DATABASE_URL
 *   AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET  (Google sign-in)
 *   AUTH_GITHUB_ID + AUTH_GITHUB_SECRET  (GitHub sign-in)
 *   AUTH_RESEND_KEY + EMAIL_FROM         (magic links)
 *
 * Each provider is registered only when its credentials are present, so a
 * deployment configures whichever it has rather than failing on the others.
 */

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      /**
       * Link a GitHub sign-in to an existing account with the same address.
       *
       * Without this, someone who signed in with Google and later clicks GitHub
       * gets `OAuthAccountNotLinked` and no way forward. The flag is named
       * "dangerous" because linking on an unverified address would let anyone
       * claiming an email walk into the matching account — which matters here,
       * where accounts carry curator and admin roles.
       *
       * It is safe for this pair specifically: Google returns `email_verified`,
       * and Auth.js's GitHub provider reads the primary address from
       * /user/emails, which GitHub only marks primary once verified. Do not copy
       * this onto a provider that does not verify.
       */
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role =
          (user as { role?: "user" | "curator" | "admin" }).role ?? "user";
        session.user.kind =
          (user as { kind?: "human" | "agent" }).kind ?? "human";
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
