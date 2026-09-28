import { MailShell } from "@/app/(app)/[emailAccountId]/mail/MailShell";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailLabelsProvider } from "@/providers/EmailLabelsProvider";
import { MailEngineHost } from "@/utils/mail-engine/MailEngineHost";

export const maxDuration = 180;

export default function Mail() {
  return (
    <EmailLabelsProvider>
      <MailEngineHost>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PermissionsCheck />
          <MailShell />
        </div>
      </MailEngineHost>
    </EmailLabelsProvider>
  );
}
