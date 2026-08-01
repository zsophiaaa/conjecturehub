import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads this to generate and run SQL migrations for the community
 * layer. Run `npm run db:generate` after editing src/db/schema.ts, then
 * `npm run db:migrate` to apply. Requires DATABASE_URL in the environment
 * (load it from .env.local, e.g. `export $(grep -v '^#' .env.local | xargs)`).
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
