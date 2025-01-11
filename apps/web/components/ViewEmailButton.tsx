import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";

export function ViewEmailButton({
  threadId,
  messageId,
}: {
  threadId: string;
  messageId: string;
}) {
  const { showEmail } = useDisplayedEmail();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => showEmail({ threadId, messageId })}
    >
      <MailIcon className="h-4 w-4" />
      <span className="sr-only">View email</span>
    </Button>
  );
}
