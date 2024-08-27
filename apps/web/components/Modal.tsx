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
import { cn } from "@/utils";

export interface ModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  hideModal: () => void;
  fullWidth?: boolean;
  title?: string;
  size?: "xl" | "2xl" | "4xl" | "6xl";
  padding?: "sm" | "none";
  backdropClass?: string;
}

export function useModal() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const openModal = React.useCallback(() => setIsModalOpen(true), []);
  const closeModal = React.useCallback(() => setIsModalOpen(false), []);

  return { isModalOpen, openModal, closeModal, setIsModalOpen };
}

export function Modal(props: ModalProps) {
  return (
    <Transition appear show={props.isOpen} as="div">
      <Dialog as="div" className="relative z-50" onClose={props.hideModal}>
        <TransitionChild
          as="div"
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className={cn(
              "fixed inset-0 bg-black bg-opacity-25",
              props.backdropClass,
            )}
          />
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
              className={clsx(
                "w-full transform rounded-2xl bg-white text-left align-middle shadow-xl transition-all",
                {
                  "p-6": props.padding === "sm",
                  "p-10": !props.padding,
                  "sm:w-full sm:max-w-xl":
                    !props.fullWidth && (!props.size || props.size === "xl"),
                  "sm:w-full sm:max-w-2xl":
                    !props.fullWidth && props.size === "2xl",
                  "sm:w-full sm:max-w-4xl":
                    !props.fullWidth && props.size === "4xl",
                  "sm:w-full sm:max-w-6xl":
                    !props.fullWidth && props.size === "6xl",
                  "sm:w-full sm:max-w-full": props.fullWidth,
                },
              )}
            >
              <DialogPanel>
                {props.title && (
                  <DialogTitle as="h3" className="font-cal text-xl leading-6">
                    {props.title}
                  </DialogTitle>
                )}
                {props.children}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
