import { AdminUpgradeUserForm } from "@/app/(app)/admin/AdminUpgradeUserForm";
import { AdminUserControls } from "@/app/(app)/admin/AdminUserControls";
import { auth } from "@/utils/auth";
import { ErrorPage } from "@/components/ErrorPage";
import { isAdmin } from "@/utils/admin";
import {
  AdminSyncStripe,
  AdminSyncStripeCustomers,
} from "@/app/(app)/admin/AdminSyncStripe";
import { RegisterSSOModal } from "@/app/(app)/admin/RegisterSSOModal";
import { AdminHashEmail } from "@/app/(app)/admin/AdminHashEmail";
import { GmailUrlConverter } from "@/app/(app)/admin/GmailUrlConverter";
import { DebugLabels } from "@/app/(app)/admin/DebugLabels";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

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
    <PageWrapper>
      <PageHeader title="Admin" description="" />

      <div className="space-y-8 mt-4 mb-20">
        <AdminUpgradeUserForm />
        <AdminUserControls />
        <AdminHashEmail />
        <GmailUrlConverter />
        <DebugLabels />
        <RegisterSSOModal />

        <div className="flex gap-2">
          <AdminSyncStripe />
          <AdminSyncStripeCustomers />
        </div>
      </div>
    </PageWrapper>
  );
}
