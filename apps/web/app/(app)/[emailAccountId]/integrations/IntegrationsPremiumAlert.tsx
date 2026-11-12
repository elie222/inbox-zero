"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { CrownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";

export function IntegrationsPremiumAlert() {
  const { t } = useLingui();
  const { PremiumModal, openModal } = usePremiumModal();

  return (
    <>
      <ActionCard
        icon={<CrownIcon className="h-5 w-5" />}
        title={t`Plus Plan Required`}
        description={t`Connect your CRM and tools to help the AI draft better replies and generate richer meeting briefs.`}
        action={
          <Button variant="primaryBlack" onClick={openModal}>
            <Trans>Upgrade</Trans>
          </Button>
        }
      />
      <PremiumModal />
    </>
  );
}
