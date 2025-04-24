"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGmailUrl } from "@/utils/url";

export function OpenMultipleGmailButton({
  threadIds,
  userEmail,
}: {
  threadIds: string[];
  userEmail: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        for (const threadId of threadIds) {
          const url = getGmailUrl(threadId, userEmail);
          window.open(url, "_blank");
        }
      }}
    >
      Open each in new tab
      <ExternalLinkIcon className="ml-2 h-4 w-4" />
    </Button>
  );
}
