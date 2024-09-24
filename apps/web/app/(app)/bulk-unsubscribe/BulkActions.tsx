import { usePostHog } from "posthog-js/react";
import {
  useBulkUnsubscribe,
  useBulkApprove,
  useBulkAutoArchive,
  useBulkArchive,
  useBulkDelete,
} from "@/app/(app)/bulk-unsubscribe/hooks";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { ButtonLoader } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";

export function BulkActions({
  selected,
  mutate,
}: {
  selected: Map<string, boolean>;
  mutate: () => Promise<any>;
}) {
  const posthog = usePostHog();
  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  const { bulkUnsubscribeLoading, onBulkUnsubscribe } = useBulkUnsubscribe({
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });

  const { bulkApproveLoading, onBulkApprove } = useBulkApprove({
    mutate,
    posthog,
  });

  const { bulkAutoArchiveLoading, onBulkAutoArchive } = useBulkAutoArchive({
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });

  const { onBulkArchive } = useBulkArchive({ mutate, posthog });

  const { onBulkDelete } = useBulkDelete({ mutate, posthog });

  const getSelectedValues = () =>
    Array.from(selected.entries())
      .filter(([_, value]) => value)
      .map(([name, value]) => ({
        name,
        value,
      }));

  return (
    <>
      <PremiumTooltip showTooltip={!hasUnsubscribeAccess} openModal={openModal}>
        <div className="flex items-center space-x-1.5">
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkUnsubscribe(getSelectedValues())}
              loading={bulkUnsubscribeLoading}
            >
              Unsubscribe
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkAutoArchive(getSelectedValues())}
              loading={bulkAutoArchiveLoading}
            >
              Auto Archive
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkApprove(getSelectedValues())}
              loading={bulkApproveLoading}
            >
              Approve
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkArchive(getSelectedValues())}
            >
              Archive All
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkDelete(getSelectedValues())}
            >
              Delete All
            </Button>
          </div>
        </div>
      </PremiumTooltip>
      <PremiumModal />
    </>
  );
}
