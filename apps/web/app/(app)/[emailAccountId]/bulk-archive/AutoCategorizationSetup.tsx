"use client";

import { useState, useCallback } from "react";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
    title: msg`Sorted automatically`,
    description: msg`We group senders into categories like Newsletters, Receipts, and Marketing`,
  },
  {
    icon: <ArchiveIcon className="size-4 text-blue-500" />,
    title: msg`Archive by category`,
    description: msg`Clean up an entire category at once instead of one email at a time`,
  },
  {
    icon: <RotateCcwIcon className="size-4 text-blue-500" />,
    title: msg`Always reversible`,
    description: msg`Emails are archived, not deleted — you can find them anytime`,
  },
];

export function AutoCategorizationSetup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t, i18n } = useLingui();
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

      if (!result?.data) {
        toastSuccess({
          description: t`Categorization started.`,
        });
        onOpenChange?.(false);
      } else if (result.data.totalUncategorizedSenders) {
        toastSuccess({
          description: t`${plural(result.data.totalUncategorizedSenders, {
            one: "Categorizing # sender... This may take a few minutes.",
            other: "Categorizing # senders... This may take a few minutes.",
          })}`,
        });
        onOpenChange?.(false);
      } else {
        toastSuccess({
          description: t`No more senders to categorize right now.`,
        });
        setIsBulkCategorizing(false);
        onOpenChange?.(false);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t`Unknown error`;
      toastError({
        description: t`Failed to enable feature: ${errorMessage}`,
      });
      setIsBulkCategorizing(false);

      if (isUpgradeError(error)) {
        onOpenChange?.(false);
      }
    } finally {
      setIsEnabling(false);
    }
  }, [emailAccountId, onOpenChange, setIsBulkCategorizing, t]);

  return (
    <SetupDialog
      open={open}
      onOpenChange={onOpenChange}
      dialogContentProps={{
        hideCloseButton: true,
        onInteractOutside: (event) => event.preventDefault(),
        onEscapeKeyDown: (event) => event.preventDefault(),
      }}
      imageSrc="/images/illustrations/working-vacation.svg"
      imageAlt={t`Bulk Archive`}
      title={t`Bulk Archive`}
      description={t`Archive thousands of emails in a few clicks.`}
      features={features.map((feature) => ({
        ...feature,
        title: i18n._(feature.title),
        description: i18n._(feature.description),
      }))}
    >
      <Button onClick={enableFeature} loading={isEnabling}>
        <Trans>Get Started</Trans>
      </Button>
    </SetupDialog>
  );
}

function isUpgradeError(error: unknown) {
  return error instanceof Error && error.message.includes("Please upgrade");
}
