import { redirect } from "next/navigation";
import AccountSettings from "@/components/AccountSettings";
import { currentUser } from "@/lib/auth";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string; deliveryFailed?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  return <AccountSettings name={user.name} email={user.email} emailVerified={user.email_verified} welcome={query.welcome === "1"} deliveryFailed={query.deliveryFailed === "1"} />;
}
