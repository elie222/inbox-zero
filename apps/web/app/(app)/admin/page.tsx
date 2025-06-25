import { AdminUpgradeUserForm } from "@/app/(app)/admin/AdminUpgradeUserForm";
import { AdminUserControls } from "@/app/(app)/admin/AdminUserControls";
import { TopSection } from "@/components/TopSection";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ErrorPage } from "@/components/ErrorPage";
import { isAdmin } from "@/utils/admin";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const maxDuration = 300;

export default async function AdminPage() {
  const session = await auth();

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        title="No Access"
        description="You do not have permission to access this page."
      />
    );
  }

  return (
    <div>
      <TopSection title="Admin" />

      <div className="m-8 space-y-8">
        <div className="mb-8 flex gap-4">
          <Link href="/admin/scheduled-actions">
            <Button variant="outline">View Scheduled Actions</Button>
          </Link>
        </div>

        <AdminUpgradeUserForm />
        <AdminUserControls />
      </div>
    </div>
  );
}
