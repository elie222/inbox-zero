"use client";

import { createContext, useContext } from "react";
import { useModal } from "@/hooks/useModal";
import { ComposeEmailFormLazy } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
      <Dialog open={isModalOpen} onOpenChange={closeModal}>
        <DialogContent
          onEscapeKeyDown={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest("[data-email-editor-link-dialog]")
            ) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <ComposeEmailFormLazy onSuccess={closeModal} />
        </DialogContent>
      </Dialog>
    </ComposeModalContext.Provider>
  );
}
