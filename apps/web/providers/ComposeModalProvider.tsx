"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useModal } from "@/hooks/useModal";
import { useAccounts } from "@/hooks/useAccounts";
import {
  ComposeEmailFormLazy,
  preloadComposeEmailForm,
} from "@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy";
import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import type { GetSendAsResponse } from "@/app/api/user/send-as/route";
import { getAccountScopedKey } from "@/utils/swr";
import type { ReplyingToEmail } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailForm";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import { discardMailboxDraft } from "@/utils/mail-engine/discard-mailbox-draft";
import {
  getDraftSessionMessageIds,
  type ReplyDraftMode,
} from "@/utils/mail-engine/reply-drafts";
import { toastError } from "@/components/Toast";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { useCloseComposeOnMailExit } from "./useCloseComposeOnMailExit";

export type PoppedOutReply = {
  emailAccountId: string;
  draftSessionId: string;
  draftKeyMessageId: string;
  draftMode: ReplyDraftMode;
  providerDraftMessageId?: string;
  replyingToEmail: ReplyingToEmail;
  /** Puts the reply back in its thread when the window is dismissed unsent. */
  onReturn?: () => void;
};

type Context = {
  onOpen: () => void;
  popOutReply: (reply: PoppedOutReply) => void;
  poppedOutDraftSessionId?: string;
};

// Fetched once per mail visit; an open composer revalidates as usual.
const WARM_ONLY = { revalidateOnFocus: false, revalidateOnReconnect: false };

const ComposeModalContext = createContext<Context>({
  onOpen: async () => {},
  popOutReply: () => {},
});

export const useComposeModal = () => useContext(ComposeModalContext);

export function ComposeModalProvider(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { emailAccountId } = useAccount();
  const { isModalOpen, openModal, closeModal } = useModal();
  const [isExpanded, setIsExpanded] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [poppedOutReply, setPoppedOutReply] = useState<PoppedOutReply>();
  // A popped-out reply belongs to the account it was written from.
  const reply =
    poppedOutReply?.emailAccountId === emailAccountId
      ? poppedOutReply
      : undefined;
  const isMailView = pathname.endsWith("/mail");
  const isAllAccountsMailView =
    isMailView && searchParams.get("accountScope") === "all";
  const { data: accountsData } = useAccounts(isAllAccountsMailView);
  // The composer waits for its code, signature and send-as addresses, so they
  // are fetched while mail is open (and kept across reloads by the SWR
  // snapshot) and a shortcut opens it at once.
  useSWR<GetSignatureResponse>(
    isMailView
      ? getAccountScopedKey("/api/user/signature", emailAccountId)
      : null,
    WARM_ONLY,
  );
  useSWR<GetSendAsResponse>(
    isMailView
      ? getAccountScopedKey("/api/user/send-as", emailAccountId)
      : null,
    WARM_ONLY,
  );
  useEffect(() => {
    if (isMailView) preloadComposeEmailForm();
  }, [isMailView]);
  const isOpen = isModalOpen && (!poppedOutReply || Boolean(reply));
  const returnOpenReply = useCallback(() => {
    if (isOpen) reply?.onReturn?.();
  }, [isOpen, reply]);
  const openCompose = useCallback(() => {
    returnOpenReply();
    setIsExpanded(false);
    setPoppedOutReply(undefined);
    openModal();
  }, [openModal, returnOpenReply]);
  const popOutReply = useCallback(
    (nextReply: PoppedOutReply) => {
      returnOpenReply();
      setIsExpanded(false);
      setPoppedOutReply(nextReply);
      openModal();
    },
    [openModal, returnOpenReply],
  );
  // Keeps the popped-out reply so undo send can reopen it.
  const closeCompose = useCallback(() => {
    setIsExpanded(false);
    closeModal();
  }, [closeModal]);
  const restoreCompose = useCallback(() => {
    setComposerKey((key) => key + 1);
    openModal();
  }, [openModal]);
  const discardReply = useCallback(
    async (draftId?: string) => {
      if (reply?.providerDraftMessageId) {
        try {
          await discardMailboxDraft({
            client: getActiveMailClient(),
            emailAccountId: reply.emailAccountId,
            messageIds: getDraftSessionMessageIds(
              reply.emailAccountId,
              reply.providerDraftMessageId,
            ),
            draftId,
          });
        } catch (error) {
          toastError({
            description:
              error instanceof Error
                ? error.message
                : "Failed to discard draft",
          });
          return false;
        }
      }
      closeCompose();
      return true;
    },
    [reply, closeCompose],
  );
  const contextValue = useMemo(
    () => ({
      onOpen: openCompose,
      popOutReply,
      poppedOutDraftSessionId: isOpen ? reply?.draftSessionId : undefined,
    }),
    [openCompose, popOutReply, isOpen, reply?.draftSessionId],
  );
  useCloseComposeOnMailExit({ isMailView, closeCompose });

  return (
    <ComposeModalContext.Provider value={contextValue}>
      {props.children}
      <Dialog
        modal={false}
        open={isOpen}
        onOpenChange={(open) => {
          if (open) return;
          returnOpenReply();
          closeCompose();
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
              {reply ? reply.replyingToEmail.subject || "Reply" : "New Message"}
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
              {reply ? (
                <ComposeEmailFormLazy
                  key={`${reply.draftSessionId}:${composerKey}`}
                  draftKeyMessageId={reply.draftKeyMessageId}
                  draftMode={reply.draftMode}
                  draftSessionId={reply.draftSessionId}
                  layout="window"
                  onClose={closeCompose}
                  onDiscard={discardReply}
                  onRestore={restoreCompose}
                  onSuccess={closeCompose}
                  providerDraftMessageId={reply.providerDraftMessageId}
                  replyingToEmail={reply.replyingToEmail}
                />
              ) : (
                <ComposeEmailFormLazy
                  key={composerKey}
                  draftSessionId="compose:new-message"
                  fromAccounts={accountsData?.emailAccounts}
                  layout="window"
                  onClose={closeCompose}
                  onDiscard={() => {
                    closeCompose();
                    return true;
                  }}
                  onRestore={() => {
                    setComposerKey((key) => key + 1);
                    openCompose();
                  }}
                  onSuccess={closeCompose}
                />
              )}
            </div>
          </main>
        </DialogContent>
      </Dialog>
    </ComposeModalContext.Provider>
  );
}
