import RecoveryForm from "@/components/RecoveryForm";
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { return <main className="min-h-screen px-5 py-20"><RecoveryForm token={(await searchParams).token} /></main>; }
