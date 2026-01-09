import { memo } from "react";
import { extractNameFromEmail, extractEmailAddress } from "@/utils/email";

export const EmailCell = memo(function EmailCell({
  emailAddress,
  name,
  className,
}: {
  emailAddress: string;
  name?: string | null;
  className?: string;
}) {
  const displayName = name || extractNameFromEmail(emailAddress);
  const email = extractEmailAddress(emailAddress) || emailAddress;
  const showEmail = displayName !== email;

  return (
    <div className={className}>
      <div>{displayName}</div>
      {showEmail && <div className="text-muted-foreground">{email}</div>}
    </div>
  );
});
