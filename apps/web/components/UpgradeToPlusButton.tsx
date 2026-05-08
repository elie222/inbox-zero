"use client";

import { CrownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";

export function UpgradeToPlusButton({ tooltip }: { tooltip: string }) {
  const { PremiumModal, openModal } = usePremiumModal();

  return (
    <>
      <Tooltip content={tooltip}>
        <Button variant="outline" size="sm" onClick={openModal}>
          <CrownIcon className="mr-2 h-4 w-4" />
          Upgrade
        </Button>
      </Tooltip>
      <PremiumModal />
    </>
  );
}
