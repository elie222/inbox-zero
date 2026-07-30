import { AdminUpgradeUserForm } from "@/app/(app)/admin/tools/AdminUpgradeUserForm";
import { AdminUserControls } from "@/app/(app)/admin/tools/AdminUserControls";
import { auth } from "@/utils/auth";
import { ErrorPage } from "@/components/ErrorPage";
import { isAdmin } from "@/utils/admin";
import {
  AdminSyncStripe,
  AdminSyncStripeCustomers,
} from "@/app/(app)/admin/tools/AdminSyncStripe";
import { RegisterSSOModal } from "@/app/(app)/admin/tools/RegisterSSOModal";
import { AdminUserInfo } from "@/app/(app)/admin/tools/AdminUserInfo";
import { AdminHashEmail } from "@/app/(app)/admin/tools/AdminHashEmail";
import { GmailUrlConverter } from "@/app/(app)/admin/tools/GmailUrlConverter";
import { DebugLabels } from "@/app/(app)/admin/tools/DebugLabels";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { AdminTopSpenders } from "@/app/(app)/admin/tools/AdminTopSpenders";

// NOTE: Turn on Fluid Compute on Vercel to allow for 800 seconds max duration
export const maxDuration = 800;

export default async function AdminToolsPage() {
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
      <PageHeader title="Admin tools" />

      <div className="space-y-8 mt-4 mb-20">
        <AdminUpgradeUserForm />
        <AdminUserControls />
        <AdminUserInfo />
        <AdminHashEmail />
        <GmailUrlConverter />
        <DebugLabels />
        <RegisterSSOModal />

        <div className="flex gap-2">
          <AdminSyncStripe />
          <AdminSyncStripeCustomers />
        </div>

        <AdminTopSpenders />
      </div>
    </PageWrapper>
  );
}
