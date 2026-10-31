import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailLabelsProvider } from "@/providers/EmailLabelsProvider";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

export default function ColdEmailBlockerPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Cold Email Blocker"
        video={{
          title: "Getting started with Cold Email Blocker",
          description:
            "Learn how to review blocked cold emails, rescue a sender, and choose what happens to cold emails.",
          muxPlaybackId: "E29tx0001FmSQqASvIM7r87P9Pro3cq0202AiZ8rOKzsyJM",
        }}
      />
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
