import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { Mark, Wordmark } from "@/components/site/Logo";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/#app");
  const initialError = (await searchParams).error === "invalid-verification" ? "This verification link is invalid or expired. Sign in and resend it from Account settings." : "";
  return <main className="min-h-screen px-5 py-12"><a href="/" className="mx-auto mb-10 flex w-fit items-center gap-2.5"><Mark size={34} /><Wordmark /></a><AuthForm mode="login" initialError={initialError} /></main>;
}
