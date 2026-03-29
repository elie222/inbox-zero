"use client";

import { useState, type ReactElement } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { ButtonProps } from "@/components/ui/button";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { Tooltip } from "@/components/Tooltip";
import { useAccount } from "@/providers/EmailAccountProvider";

export function CategorizeWithAiButton({
  buttonProps,
}: {
  buttonProps?: ButtonProps;
}) {
  const { emailAccountId } = useAccount();
  const [isCategorizing, setIsCategorizing] = useState(false);
  const { hasAiAccess } = usePremium();
  const { PremiumModal, openModal: openPremiumModal } = usePremiumModal();

  const { setIsBulkCategorizing } = useCategorizeProgress();

  return (
    <>
      <CategorizeWithAiButtonTooltip
        hasAiAccess={hasAiAccess}
        openPremiumModal={openPremiumModal}
      >
        <Button
          type="button"
          loading={isCategorizing}
          disabled={!hasAiAccess}
          onClick={async () => {
            if (isCategorizing) return;
            toast.promise(
              async () => {
                setIsCategorizing(true);
                setIsBulkCategorizing(true);
                try {
                  const result =
                    await bulkCategorizeSendersAction(emailAccountId);

                  if (result?.serverError) {
                    throw new Error(result.serverError);
                  }

                  const totalUncategorizedSenders =
                    result?.data?.totalUncategorizedSenders || 0;

                  if (totalUncategorizedSenders === 0) {
                    setIsBulkCategorizing(false);
                  }

                  return result?.data;
                } catch (error) {
                  setIsBulkCategorizing(false);
                  throw error;
                } finally {
                  setIsCategorizing(false);
                }
              },
              {
                loading: "Categorizing senders... This might take a while.",
                success: (data) => {
                  if (!data) {
                    return "Categorization started.";
                  }

                  return data.totalUncategorizedSenders
                    ? `Categorizing ${data.totalUncategorizedSenders} senders...`
                    : "No more senders to categorize right now.";
                },
                error: (err) => {
                  const message =
                    err instanceof Error
                      ? err.message
                      : "An unknown error occurred.";
                  return `Error categorizing senders: ${message}`;
                },
              },
            );
          }}
          {...buttonProps}
        >
          {buttonProps?.children || (
            <>
              <SparklesIcon className="mr-2 size-4" />
              Categorize
            </>
          )}
        </Button>
      </CategorizeWithAiButtonTooltip>
      <PremiumModal />
    </>
  );
}

function CategorizeWithAiButtonTooltip({
  children,
  hasAiAccess,
  openPremiumModal,
}: {
  children: ReactElement;
  hasAiAccess: boolean;
  openPremiumModal: () => void;
}) {
  if (hasAiAccess) {
    return (
      <Tooltip content="Categorize thousands of senders. This will take a few minutes.">
        {children}
      </Tooltip>
    );
  }

  return (
    <PremiumTooltip showTooltip={!hasAiAccess} openModal={openPremiumModal}>
      {children}
    </PremiumTooltip>
  );
}
