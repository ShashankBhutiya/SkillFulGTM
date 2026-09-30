import { redirect } from "next/navigation";
import AccountSettings from "@/components/AccountSettings";
import { currentUser } from "@/lib/auth";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <AccountSettings name={user.name} email={user.email} emailVerified={user.email_verified} welcome={(await searchParams).welcome === "1"} />;
}
