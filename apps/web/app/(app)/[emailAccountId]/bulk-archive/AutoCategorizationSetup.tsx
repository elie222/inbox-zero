"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";

export function AutoCategorizationSetup() {
  const { emailAccountId } = useAccount();
  const { setIsBulkCategorizing } = useCategorizeProgress();

  const [isEnabling, setIsEnabling] = useState(false);

  const enableFeature = useCallback(async () => {
    setIsEnabling(true);
    setIsBulkCategorizing(true);

    try {
      const result = await bulkCategorizeSendersAction(emailAccountId);

      if (result?.serverError) {
        throw new Error(result.serverError);
      }

      toast.success(
        result?.data?.totalUncategorizedSenders
          ? `Categorizing ${result.data.totalUncategorizedSenders} senders... This may take a few minutes.`
          : "No uncategorized senders found.",
      );
    } catch (error) {
      toast.error(
        `Failed to enable feature: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsBulkCategorizing(false);
    } finally {
      setIsEnabling(false);
    }
  }, [emailAccountId, setIsBulkCategorizing]);

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>Bulk Archive</CardTitle>
        <CardDescription>
          Archive emails in bulk by sender category. We'll first categorize your
          senders into groups like Newsletters, Receipts, Marketing, etc. Then
          you can quickly archive entire categories at once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={enableFeature} loading={isEnabling}>
          Enable feature
        </Button>
      </CardContent>
    </Card>
  );
}
