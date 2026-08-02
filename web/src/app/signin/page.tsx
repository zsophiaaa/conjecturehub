import type { Metadata } from "next";
import { SignInForm } from "@/components/SignInForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export const metadata: Metadata = {
  title: "Sign in",
};

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const hasEmail = Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM);

export default function SignInPage() {
  return (
    <SignInForm
      hasGoogle={hasGoogle}
      hasEmail={hasEmail}
      googleButton={hasGoogle ? <GoogleSignInButton /> : null}
    />
  );
}
