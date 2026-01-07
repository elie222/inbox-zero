"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ArchiveIcon, TagsIcon, ZapIcon } from "lucide-react";
import { SetupCard } from "@/components/SetupCard";
import { Button } from "@/components/ui/button";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";

const features = [
  {
    icon: <TagsIcon className="size-4 text-blue-500" />,
    title: "Smart categorization",
    description:
      "Automatically group senders into categories like Newsletters, Receipts, and Marketing",
  },
  {
    icon: <ArchiveIcon className="size-4 text-blue-500" />,
    title: "Bulk actions",
    description: "Archive entire categories at once instead of email by email",
  },
  {
    icon: <ZapIcon className="size-4 text-blue-500" />,
    title: "Instant cleanup",
    description: "Clear hundreds of emails in seconds, not hours",
  },
];

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
    <SetupCard
      imageSrc="/images/illustrations/working-vacation.svg"
      imageAlt="Bulk Archive"
      title="Bulk Archive"
      description="Clean up your inbox by archiving emails in bulk by category."
      features={features}
    >
      <Button onClick={enableFeature} loading={isEnabling}>
        Get Started
      </Button>
    </SetupCard>
  );
}
