import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * A single postgres connection pool, reused across hot reloads in dev and across
 * warm serverless invocations in production. `DATABASE_URL` must point at a
 * Postgres instance (Neon, Supabase, local Docker — see docs/COMMUNITY.md).
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. The community layer needs a Postgres database — see docs/COMMUNITY.md for setup.",
  );
}

const globalForDb = globalThis as unknown as {
  conjectureHubSql?: ReturnType<typeof postgres>;
};

// Neon and most serverless Postgres want a small pool; one connection is plenty
// per lambda. `prepare: false` keeps things compatible with transaction poolers.
const client =
  globalForDb.conjectureHubSql ??
  postgres(connectionString, { max: 1, prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.conjectureHubSql = client;
}

export const db = drizzle(client, { schema });
