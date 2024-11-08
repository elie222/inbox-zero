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

export function CategorizeWithAiButton() {
  const [isCategorizing, setIsCategorizing] = useState(false);
  const { hasAiAccess } = usePremium();
  const { PremiumModal, openModal: openPremiumModal } = usePremiumModal();

  return (
    <>
      <PremiumTooltip showTooltip={!hasAiAccess} openModal={openPremiumModal}>
        <Button
          type="button"
          loading={isCategorizing}
          disabled={!hasAiAccess}
          onClick={async () => {
            if (isCategorizing) return;
            toast.promise(
              async () => {
                setIsCategorizing(true);
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
                loading: "Categorizing senders...",
                success: () => {
                  return "Categorization started! This might take a while.";
                },
                error: (err) => {
                  return `Error categorizing senders: ${err.message}`;
                },
              },
            );
          }}
        >
          <SparklesIcon className="mr-2 size-4" />
          Categorize Senders with AI
        </Button>
      </PremiumTooltip>
      <PremiumModal />
    </>
  );
}
