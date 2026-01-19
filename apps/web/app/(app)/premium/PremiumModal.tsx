import { useCallback, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Pricing from "@/app/(app)/premium/Pricing";
import { tiers } from "@/app/(app)/premium/config";

const modalTiers = tiers.filter((tier) => tier.name !== "Enterprise");

function PricingDialogHeader() {
  return (
    <div className="mb-4 text-center">
      <h2 className="font-title text-2xl text-gray-900">Upgrade to Premium</h2>
    </div>
  );
}

function EnterpriseFooter() {
  return (
    <div className="flex items-center justify-between rounded-3xl border border-gray-200 bg-white p-4">
      <div>
        <h3 className="font-semibold text-gray-900">Enterprise</h3>
        <p className="text-sm text-gray-600">
          SSO, on-premise deployment, and dedicated support for large teams.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href="https://go.getinboxzero.com/sales">Speak to Sales</Link>
      </Button>
    </div>
  );
}

export function usePremiumModal() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => setIsOpen(true);

  const PremiumModal = useCallback(() => {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* premium upgrade doesn't support dark mode yet as it appears on homepage */}
        <DialogContent className="max-w-4xl bg-white">
          <Pricing
            header={<PricingDialogHeader />}
            displayTiers={modalTiers}
            className="px-0 pt-0 lg:px-0"
          />
          <EnterpriseFooter />
        </DialogContent>
      </Dialog>
    );
  }, [isOpen]);

  return {
    openModal,
    PremiumModal,
  };
}
