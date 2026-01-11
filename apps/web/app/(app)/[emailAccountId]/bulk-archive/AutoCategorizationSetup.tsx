"use client";

import { useState, useCallback } from "react";
import { toastError, toastSuccess } from "@/components/Toast";
import { ArchiveIcon, RotateCcwIcon, TagsIcon } from "lucide-react";
import { SetupDialog } from "@/components/SetupCard";
import { Button } from "@/components/ui/button";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";

const features = [
  {
    icon: <TagsIcon className="size-4 text-blue-500" />,
    title: "Sorted automatically",
    description:
      "We group senders into categories like Newsletters, Receipts, and Marketing",
  },
  {
    icon: <ArchiveIcon className="size-4 text-blue-500" />,
    title: "Archive by category",
    description:
      "Clean up an entire category at once instead of one email at a time",
  },
  {
    icon: <RotateCcwIcon className="size-4 text-blue-500" />,
    title: "Always reversible",
    description: "Emails are archived, not deleted — you can find them anytime",
  },
];

export function AutoCategorizationSetup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
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

      if (result?.data?.totalUncategorizedSenders) {
        toastSuccess({
          description: `Categorizing ${result.data.totalUncategorizedSenders} senders... This may take a few minutes.`,
        });
      } else {
        toastSuccess({ description: "No uncategorized senders found." });
        setIsBulkCategorizing(false);
      }
    } catch (error) {
      toastError({
        description: `Failed to enable feature: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      setIsBulkCategorizing(false);
    } finally {
      setIsEnabling(false);
    }
  }, [emailAccountId, setIsBulkCategorizing]);

  return (
    <SetupDialog
      open={open}
      onOpenChange={onOpenChange}
      imageSrc="/images/illustrations/working-vacation.svg"
      imageAlt="Bulk Archive"
      title="Bulk Archive"
      description="Archive thousands of emails in a few clicks."
      features={features}
    >
      <Button onClick={enableFeature} loading={isEnabling}>
        Get Started
      </Button>
    </SetupDialog>
  );
}
