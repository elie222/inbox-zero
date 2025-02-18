"use client";

import React from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import clsx from "clsx";

export interface ModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  hideModal: () => void;
  fullWidth?: boolean;
  title?: string;
  size?: "xl" | "2xl" | "4xl" | "6xl";
  padding?: "sm" | "none";
}

export function useModal() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const openModal = React.useCallback(() => setIsModalOpen(true), []);
  const closeModal = React.useCallback(() => setIsModalOpen(false), []);

  return { isModalOpen, openModal, closeModal, setIsModalOpen };
}

export function Modal({
  isOpen,
  children,
  padding,
  fullWidth,
  size,
  title,
  hideModal,
}: ModalProps) {
  return (
    <Transition appear show={isOpen} as="div">
      <Dialog as="div" className="relative z-50" onClose={hideModal}>
        <TransitionChild
          as="div"
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as="div"
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className={clsx(
                  "w-full transform rounded-2xl bg-white text-left align-middle shadow-xl transition-all",
                  {
                    "p-6": padding === "sm",
                    "p-10": !padding,
                    "sm:w-full sm:max-w-xl":
                      !fullWidth && (!size || size === "xl"),
                    "sm:w-full sm:max-w-2xl": !fullWidth && size === "2xl",
                    "sm:w-full sm:max-w-4xl": !fullWidth && size === "4xl",
                    "sm:w-full sm:max-w-6xl": !fullWidth && size === "6xl",
                    "sm:w-full sm:max-w-full": fullWidth,
                  },
                )}
              >
                {title && (
                  <DialogTitle as="h3" className="font-cal text-xl leading-6">
                    {title}
                  </DialogTitle>
                )}
                {children}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
