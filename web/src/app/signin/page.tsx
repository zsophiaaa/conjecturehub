import type { Metadata } from "next";
import { SignInForm } from "@/components/SignInForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export const metadata: Metadata = {
  title: "Sign in",
};

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const hasEmail = Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM);
const emailDisabled = process.env.EMAIL_SIGNIN_DISABLED === "1";

export default function SignInPage() {
  return (
    <SignInForm
      hasGoogle={hasGoogle}
      hasEmail={hasEmail}
      emailDisabled={emailDisabled}
      emailDisabledReason={
        emailDisabled
          ? "Not enabled on this deployment — Resend's free tier only sends to verified addresses on a custom domain. Use Google sign-in instead."
          : undefined
      }
      googleButton={hasGoogle ? <GoogleSignInButton /> : null}
    />
  );
}
