"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";
import { handleActionCall } from "@/utils/server-action";
import { isActionError } from "@/utils/error";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { ButtonProps } from "@/components/ui/button";
import { useCategorizeProgress } from "@/app/(app)/smart-categories/CategorizeProgress";
import { Tooltip } from "@/components/Tooltip";

export function CategorizeWithAiButton({
  buttonProps,
}: {
  buttonProps?: ButtonProps;
}) {
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
                const result = await handleActionCall(
                  "bulkCategorizeSendersAction",
                  bulkCategorizeSendersAction,
                );

                if (isActionError(result)) {
                  setIsCategorizing(false);
                  throw new Error(result.error);
                }

                setIsCategorizing(false);

                return result;
              },
              {
                loading: "Categorizing senders... This might take a while.",
                success: ({ totalUncategorizedSenders }) => {
                  return totalUncategorizedSenders
                    ? `Categorizing ${totalUncategorizedSenders} senders...`
                    : "There are no more senders to categorize.";
                },
                error: (err) => {
                  return `Error categorizing senders: ${err.message}`;
                },
              },
            );
          }}
          {...buttonProps}
        >
          {buttonProps?.children || (
            <>
              <SparklesIcon className="mr-2 size-4" />
              Categorize Senders with AI
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
  children: React.ReactElement<any>;
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
