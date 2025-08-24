"use client";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { MessageCircleIcon } from "lucide-react";

export function AIChatButton() {
  const { setOpen } = useSidebar();

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setOpen(["chat-sidebar"])}
    >
      <MessageCircleIcon className="mr-2 size-4" />
      AI Chat
    </Button>
  );
}
