"use client";

import { createContext, useContext } from "react";
import { Modal, useModal } from "@/components/Modal";
import { ComposeEmailForm } from "@/app/(app)/compose/ComposeEmailForm";

type Context = {
  onOpen: () => void;
};

const ComposeModalContext = createContext<Context>({
  onOpen: async () => {},
});

export const useComposeModal = () => useContext(ComposeModalContext);

export function ComposeModalProvider(props: { children: React.ReactNode }) {
  const { isModalOpen, openModal, closeModal } = useModal();

  return (
    <ComposeModalContext.Provider value={{ onOpen: openModal }}>
      {props.children}
      <Modal
        isOpen={isModalOpen}
        hideModal={closeModal}
        title="New Message"
        size="4xl"
        padding="sm"
      >
        <div className="mt-4">
          <ComposeEmailForm />
        </div>
      </Modal>
    </ComposeModalContext.Provider>
  );
}
