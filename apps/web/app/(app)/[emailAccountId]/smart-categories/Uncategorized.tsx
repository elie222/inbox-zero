"use client";

import useSWRInfinite from "swr/infinite";
import { useMemo, useCallback } from "react";
import { ChevronsDownIcon, SparklesIcon, StopCircleIcon } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { SendersTable } from "@/components/GroupedTable";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import type { UncategorizedSendersResponse } from "@/app/api/user/categorize/senders/uncategorized/route";
import { TopBar } from "@/components/TopBar";
import { toastError } from "@/components/Toast";
import {
  useHasProcessingItems,
  pushToAiCategorizeSenderQueueAtom,
  stopAiCategorizeSenderQueue,
} from "@/store/ai-categorize-sender-queue";
import { SectionDescription } from "@/components/Typography";
import { ButtonLoader } from "@/components/Loading";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { Toggle } from "@/components/Toggle";
import { setAutoCategorizeAction } from "@/utils/actions/categorize";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import type { CategoryWithRules } from "@/utils/category.server";
import { useAccount } from "@/providers/EmailAccountProvider";

export function Uncategorized({
  categories,
  autoCategorizeSenders,
}: {
  categories: CategoryWithRules[];
  autoCategorizeSenders: boolean;
}) {
  const { hasAiAccess } = usePremium();
  const { PremiumModal, openModal: openPremiumModal } = usePremiumModal();

  const { data: senderAddresses, loadMore, isLoading, hasMore } = useSenders();
  const hasProcessingItems = useHasProcessingItems();

  const senders = useMemo(
    () =>
      senderAddresses?.map((address) => {
        return { address, category: null };
      }),
    [senderAddresses],
  );

  const { emailAccountId } = useAccount();

  return (
    <LoadingContent loading={!senderAddresses && isLoading}>
      <TopBar>
        <div className="flex gap-2">
          <PremiumTooltip
            showTooltip={!hasAiAccess}
            openModal={openPremiumModal}
          >
            <Button
              loading={hasProcessingItems}
              disabled={!hasAiAccess}
              onClick={async () => {
                if (!senderAddresses?.length) {
                  toastError({ description: "No senders to categorize" });
                  return;
                }

                pushToAiCategorizeSenderQueueAtom({
                  pushIds: senderAddresses,
                  emailAccountId,
                });
              }}
            >
              <SparklesIcon className="mr-2 size-4" />
              Categorize all with AI
            </Button>
          </PremiumTooltip>

          {hasProcessingItems && (
            <Button
              variant="outline"
              onClick={() => {
                stopAiCategorizeSenderQueue();
              }}
            >
              <StopCircleIcon className="mr-2 size-4" />
              Stop
            </Button>
          )}
        </div>

        <div className="flex items-center">
          <div className="mr-1.5">
            <TooltipExplanation
              size="sm"
              text="Automatically categorize new senders when they email you"
            />
          </div>
          <AutoCategorizeToggle
            autoCategorizeSenders={autoCategorizeSenders}
            emailAccountId={emailAccountId}
          />
        </div>
      </TopBar>
      <ClientOnly>
        {senders?.length ? (
          <>
            <SendersTable senders={senders} categories={categories} />
            {hasMore && (
              <Button
                variant="outline"
                className="mx-2 mb-4 mt-2 w-full"
                onClick={loadMore}
              >
                {isLoading ? (
                  <ButtonLoader />
                ) : (
                  <ChevronsDownIcon className="mr-2 size-4" />
                )}
                Load More
              </Button>
            )}
          </>
        ) : (
          !isLoading && (
            <SectionDescription className="p-4">
              No senders left to categorize!
            </SectionDescription>
          )
        )}
      </ClientOnly>
      <PremiumModal />
    </LoadingContent>
  );
}

function AutoCategorizeToggle({
  autoCategorizeSenders,
  emailAccountId,
}: {
  autoCategorizeSenders: boolean;
  emailAccountId: string;
}) {
  return (
    <Toggle
      name="autoCategorizeSenders"
      label="Auto categorize"
      enabled={autoCategorizeSenders}
      onChange={async (enabled) => {
        await setAutoCategorizeAction(emailAccountId, {
          autoCategorizeSenders: enabled,
        });
      }}
    />
  );
}

function useSenders() {
  const getKey = (
    pageIndex: number,
    previousPageData: UncategorizedSendersResponse | null,
  ) => {
    // Reached the end
    if (previousPageData && !previousPageData.nextOffset) return null;

    const baseUrl = "/api/user/categorize/senders/uncategorized";
    const offset = pageIndex === 0 ? 0 : previousPageData?.nextOffset;

    return `${baseUrl}?offset=${offset}`;
  };

  const { data, size, setSize, isLoading } =
    useSWRInfinite<UncategorizedSendersResponse>(getKey, {
      revalidateOnFocus: false,
      revalidateFirstPage: false,
      persistSize: true,
      revalidateOnMount: true,
    });

  const loadMore = useCallback(() => {
    setSize(size + 1);
  }, [setSize, size]);

  // Combine all senders from all pages
  const allSenders = useMemo(() => {
    return data?.flatMap((page) => page.uncategorizedSenders);
  }, [data]);

  // Check if there's more data to load by looking at the last page
  const hasMore = !!data?.[data.length - 1]?.nextOffset;

  return {
    data: allSenders,
    loadMore,
    isLoading,
    hasMore,
  };
}
