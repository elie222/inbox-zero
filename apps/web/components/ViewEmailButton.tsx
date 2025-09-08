import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { Tooltip } from "@/components/Tooltip";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function ViewEmailButton({
  threadId,
  messageId,
  className,
  size,
}: {
  threadId: string;
  messageId: string;
  className?: string;
  size?: "icon" | "xs" | "sm";
}) {
  const { provider } = useAccount();
  const { showEmail } = useDisplayedEmail();

  if (!isGoogleProvider(provider)) {
    return null;
  }

  return (
    <Tooltip content="View email">
      <Button
        variant="outline"
        size={size || "icon"}
        onClick={() => showEmail({ threadId, messageId })}
        className={className}
      >
        <MailIcon className="h-4 w-4" />
        <span className="sr-only">View email</span>
      </Button>
    </Tooltip>
  );
}
