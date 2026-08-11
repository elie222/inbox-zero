"use client";

import { MailShell } from "@/app/(app)/[emailAccountId]/mail/MailShell";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailProvider } from "@/providers/EmailProvider";

export default function Mail() {
  return (
    <EmailProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PermissionsCheck />
        <MailShell />
      </div>
    </EmailProvider>
  );
}
