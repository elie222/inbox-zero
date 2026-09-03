"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useModal } from "@/hooks/useModal";
import { useAccounts } from "@/hooks/useAccounts";
import { ComposeEmailFormLazy } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { useCloseComposeOnMailExit } from "./useCloseComposeOnMailExit";

type Context = {
  onOpen: () => void;
};

const ComposeModalContext = createContext<Context>({
  onOpen: async () => {},
});

export const useComposeModal = () => useContext(ComposeModalContext);

export function ComposeModalProvider(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isModalOpen, openModal, closeModal } = useModal();
  const [isExpanded, setIsExpanded] = useState(false);
  const isMailView = pathname.endsWith("/mail");
  const isAllAccountsMailView =
    isMailView && searchParams.get("accountScope") === "all";
  const { data: accountsData } = useAccounts(isAllAccountsMailView);
  const openCompose = useCallback(() => {
    setIsExpanded(false);
    openModal();
  }, [openModal]);
  const closeCompose = useCallback(() => {
    setIsExpanded(false);
    closeModal();
  }, [closeModal]);
  useCloseComposeOnMailExit({ isMailView, closeCompose });

  return (
    <ComposeModalContext.Provider value={{ onOpen: openCompose }}>
      {props.children}
      <Dialog
        modal={false}
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open) closeCompose();
        }}
      >
        <DialogContent
          className={cn(
            "fixed z-50 flex max-h-none max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden bg-background p-0",
            isExpanded
              ? "inset-0 h-dvh w-screen rounded-none border-0 shadow-none"
              : "bottom-3 left-auto right-3 top-auto h-[min(42rem,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] rounded-xl border border-border shadow-2xl sm:bottom-4 sm:right-4 sm:w-[38rem]",
          )}
          data-compose-expanded={isExpanded}
          hideCloseButton
          hideOverlay
          onEscapeKeyDown={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest("[data-email-editor-link-dialog]")
            ) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => event.preventDefault()}
          unstyled
        >
          <header
            className={cn(
              "flex h-12 shrink-0 items-center justify-between px-3",
              isExpanded ? "mx-auto h-20 w-full max-w-6xl px-6" : "border-b",
            )}
          >
            <DialogTitle
              className={cn(
                "text-sm font-semibold",
                isExpanded && "text-2xl font-medium",
              )}
            >
              New Message
            </DialogTitle>
            <div className="flex items-center gap-0.5">
              <Button
                aria-label={isExpanded ? "Restore compose" : "Expand compose"}
                onClick={() => setIsExpanded((expanded) => !expanded)}
                size="iconSm"
                title={isExpanded ? "Restore compose" : "Expand compose"}
                variant="ghost"
              >
                {isExpanded ? (
                  <Minimize2Icon className="size-4" />
                ) : (
                  <Maximize2Icon className="size-4" />
                )}
              </Button>
              <DialogClose asChild>
                <Button
                  aria-label="Close compose"
                  size="iconSm"
                  title="Close compose"
                  variant="ghost"
                >
                  <XIcon className="size-4" />
                </Button>
              </DialogClose>
            </div>
          </header>
          <main
            className={cn(
              "min-h-0 flex-1",
              isExpanded && "mx-auto w-full max-w-6xl px-6 pb-6",
            )}
          >
            <div
              className={cn(
                "h-full overflow-hidden bg-background",
                isExpanded && "rounded-xl border shadow-lg",
              )}
            >
              <ComposeEmailFormLazy
                fromAccounts={accountsData?.emailAccounts}
                layout="window"
                onClose={closeCompose}
                onDiscard={closeCompose}
                onSuccess={closeCompose}
              />
            </div>
          </main>
        </DialogContent>
      </Dialog>
    </ComposeModalContext.Provider>
  );
}
