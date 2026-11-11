"use client";

import { MessageCircleIcon } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function AIChatButton() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => toggleSidebar(["chat-sidebar"])}
    >
      <MessageCircleIcon className="mr-2 size-4" />
      <Trans>AI Chat</Trans>
    </Button>
  );
}
