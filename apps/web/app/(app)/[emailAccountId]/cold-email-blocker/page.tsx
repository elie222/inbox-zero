import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailLabelsProvider } from "@/providers/EmailLabelsProvider";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

export default function ColdEmailBlockerPage() {
  return (
    <PageWrapper>
      <PageHeader title="Cold Email Blocker" />
      <EmailLabelsProvider>
        <Suspense>
          <PermissionsCheck />
          <div className="mt-4">
            <ColdEmailContent />
          </div>
        </Suspense>
      </EmailLabelsProvider>
    </PageWrapper>
  );
}
