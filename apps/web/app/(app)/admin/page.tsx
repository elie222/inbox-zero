import { AdminUpgradeUserForm } from "@/app/(app)/admin/AdminUpgradeUserForm";
import { AdminUserControls } from "@/app/(app)/admin/AdminUserControls";
import { AdminEnterpriseControls } from "@/app/(app)/admin/AdminEnterpriseControls";
import { TopSection } from "@/components/TopSection";
import { auth } from "@/utils/auth";
import { ErrorPage } from "@/components/ErrorPage";
import { isAdmin } from "@/utils/admin";
import {
  AdminSyncStripe,
  AdminSyncStripeCustomers,
} from "@/app/(app)/admin/AdminSyncStripe";

// NOTE: Turn on Fluid Compute on Vercel to allow for 800 seconds max duration
export const maxDuration = 800;

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
        <AdminUpgradeUserForm />
        <AdminUserControls />
        <AdminEnterpriseControls />

        <div className="flex gap-2">
          <AdminSyncStripe />
          <AdminSyncStripeCustomers />
        </div>
      </div>
    </div>
  );
}
