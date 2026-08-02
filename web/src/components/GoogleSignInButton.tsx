import { signIn } from "@/auth";

/** Server action avoids client POST → 308 redirect issues with trailingSlash. */
export function GoogleSignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/" });
      }}
    >
      <button type="submit" className="ui-btn w-full">
        Continue with Google
      </button>
    </form>
  );
}
