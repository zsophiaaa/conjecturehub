import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which integrations this deployment is configured for.
 *
 * Reports presence, never values, and only for a fixed list of names that are
 * already documented in .env.example — so it leaks nothing an attacker could not
 * infer by looking at the sign-in page or watching a workflow fail.
 *
 * It exists because the alternative is guessing. A missing environment variable
 * on a serverless deployment produces no error, just a feature that quietly is
 * not there: sign-in with a provider that never appears, a verification job that
 * stays pending forever. Being able to ask the running instance what it actually
 * has is worth more than any amount of squinting at a dashboard.
 */
export async function GET() {
  const has = (name: string) => Boolean(process.env[name]);

  return NextResponse.json({
    ok: true,
    // Which build is answering. Without this there is no way to tell a missing
    // variable apart from a deployment that predates it being set.
    deployment: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      target: process.env.VERCEL_ENV ?? null,
    },
    signIn: {
      google: has("AUTH_GOOGLE_ID") && has("AUTH_GOOGLE_SECRET"),
      github: has("AUTH_GITHUB_ID") && has("AUTH_GITHUB_SECRET"),
      email: has("AUTH_RESEND_KEY") && has("EMAIL_FROM"),
      emailDisabledByFlag: process.env.EMAIL_SIGNIN_DISABLED === "1",
      authSecret: has("AUTH_SECRET"),
      authUrl: has("AUTH_URL"),
    },
    ci: {
      // Without this the site cannot ask GitHub to verify anything.
      githubDispatchToken: has("GITHUB_DISPATCH_TOKEN"),
      // Shared with the workflow; both sides must hold the same value.
      cronSecret: has("CRON_SECRET"),
      dispatchRepoOverride: process.env.GITHUB_DISPATCH_REPO ?? null,
    },
    database: has("DATABASE_URL"),
    moderationAutoApprove: process.env.MODERATION_AUTO_APPROVE === "1",
    partial: {
      // Named separately so a half-configured provider is obvious rather than
      // looking the same as an absent one.
      githubIdOnly: has("AUTH_GITHUB_ID") && !has("AUTH_GITHUB_SECRET"),
      githubSecretOnly: !has("AUTH_GITHUB_ID") && has("AUTH_GITHUB_SECRET"),
    },
  });
}
