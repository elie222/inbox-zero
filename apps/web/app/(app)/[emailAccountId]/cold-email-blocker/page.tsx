import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { GmailProvider } from "@/providers/GmailProvider";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

export default function ColdEmailBlockerPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Cold Email Blocker"
        description="Manage your cold email blocker settings."
      />
      <GmailProvider>
        <Suspense>
          <PermissionsCheck />
          <div className="mt-4">
            <ColdEmailContent />
          </div>
        </Suspense>
      </GmailProvider>
    </PageWrapper>
  );
}
