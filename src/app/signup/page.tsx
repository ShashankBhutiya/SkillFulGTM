import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { Mark, Wordmark } from "@/components/site/Logo";

export default async function SignupPage() {
  if (await currentUser()) redirect("/account?welcome=1");
  return <main className="min-h-screen px-5 py-12"><a href="/" className="mx-auto mb-10 flex w-fit items-center gap-2.5"><Mark size={34} /><Wordmark /></a><AuthForm mode="signup" /></main>;
}
