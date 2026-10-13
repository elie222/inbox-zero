"use client";

import { useSetAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { bulkRunPanelAtom } from "@/store/bulk-run-panel";

export function BulkRunRules() {
  const { emailAccountId } = useAccount();
  const setPanel = useSetAtom(bulkRunPanelAtom);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setPanel({ open: true, emailAccountId })}
    >
      Process Past Emails
    </Button>
  );
}
