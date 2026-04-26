import { memo } from "react";
import { extractNameFromEmail, extractEmailAddress } from "@/utils/email";

export const EmailCell = memo(function EmailCell({
  emailAddress,
  name,
  className,
  singleLine = false,
}: {
  emailAddress: string;
  name?: string | null;
  className?: string;
  singleLine?: boolean;
}) {
  const displayName = name || extractNameFromEmail(emailAddress);
  const email = extractEmailAddress(emailAddress) || emailAddress;
  const showEmail = displayName !== email;

  if (singleLine) {
    return (
      <div className={className}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{displayName}</span>
          {showEmail && (
            <>
              <span
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
              >
                ·
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {email}
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div>{displayName}</div>
      {showEmail && (
        <div className="text-xs text-muted-foreground">{email}</div>
      )}
    </div>
  );
});
