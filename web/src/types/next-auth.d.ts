import type { DefaultSession } from "next-auth";

/**
 * Augment the Auth.js session so `session.user.id` and `session.user.role` are
 * typed everywhere. The values are populated in the `session` callback in
 * web/src/auth.ts from the database user row.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "curator" | "admin";
      kind: "human" | "agent";
    } & DefaultSession["user"];
  }
}
