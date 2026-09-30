import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { Mark, Wordmark } from "@/components/site/Logo";

export default async function LoginPage() {
  if (await currentUser()) redirect("/#app");
  return <main className="min-h-screen px-5 py-12"><a href="/" className="mx-auto mb-10 flex w-fit items-center gap-2.5"><Mark size={34} /><Wordmark /></a><AuthForm mode="login" /></main>;
}
