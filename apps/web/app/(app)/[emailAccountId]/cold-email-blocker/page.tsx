import { Suspense } from "react";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { GmailProvider } from "@/providers/GmailProvider";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";

export default function ColdEmailBlockerPage() {
  return (
    <GmailProvider>
      <Suspense>
        <PermissionsCheck />
        <div className="content-container">
          <PremiumAlertWithData className="mt-2" />
        </div>

        <ColdEmailContent isInset />
      </Suspense>
    </GmailProvider>
  );
}
