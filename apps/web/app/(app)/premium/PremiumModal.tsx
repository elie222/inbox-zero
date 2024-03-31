import { useCallback } from "react";
import { useModal, Modal } from "@/components/Modal";
import { Pricing } from "@/app/(app)/premium/Pricing";

export function usePremiumModal() {
  const { isModalOpen, openModal, closeModal } = useModal();

  const PremiumModal = useCallback(() => {
    return (
      <Modal isOpen={isModalOpen} hideModal={closeModal} title="" size="6xl">
        <Pricing />
      </Modal>
    );
  }, [closeModal, isModalOpen]);

  return {
    openModal,
    PremiumModal,
  };
}
