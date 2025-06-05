import { useCallback, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import Pricing from "@/app/(app)/premium/Pricing";

export function usePremiumModal() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => setIsOpen(true);

  const PremiumModal = useCallback(() => {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* premium upgrade doesn't support dark mode yet as it appears on homepage */}
        <DialogContent className="max-w-6xl bg-white">
          <Pricing />
        </DialogContent>
      </Dialog>
    );
  }, [isOpen]);

  return {
    openModal,
    PremiumModal,
  };
}
