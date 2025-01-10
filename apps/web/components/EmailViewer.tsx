"use client";

import { useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";

export function EmailViewer() {
  const { messageId, showEmail } = useDisplayedEmail();

  const hideEmail = useCallback(() => showEmail(null), [showEmail]);

  return (
    <Sheet open={!!messageId} onOpenChange={hideEmail}>
      <SheetContent side="right" className="w-full sm:w-4/5 md:w-3/4 lg:w-2/3">
        {messageId && <EmailContent messageId={messageId} />}
      </SheetContent>
    </Sheet>
  );
}

function EmailContent({ messageId }: { messageId: string }) {
  // Fetch and display email content
  return (
    <div className="p-4">
      {/* Email content */}
      <h2>Email {messageId}</h2>
    </div>
  );
}
