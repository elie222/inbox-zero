import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { GmailProvider } from "@/providers/GmailProvider";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";

export default function ColdEmailBlockerPage() {
  return (
    <GmailProvider>
      <Suspense>
        <PermissionsCheck />
        <ColdEmailContent isInset />
      </Suspense>
    </GmailProvider>
  );
}
