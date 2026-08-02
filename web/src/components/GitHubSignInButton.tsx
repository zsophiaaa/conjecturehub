import { signIn } from "@/auth";

/** Server action avoids client POST → 308 redirect issues with trailingSlash. */
export function GitHubSignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("github", { redirectTo: "/" });
      }}
    >
      <button type="submit" className="ui-btn w-full">
        Continue with GitHub
      </button>
    </form>
  );
}
