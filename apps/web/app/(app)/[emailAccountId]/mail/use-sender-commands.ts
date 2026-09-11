"use client";

import { useEffect, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useUnsubscribeSender } from "@/app/(app)/[emailAccountId]/mail/use-unsubscribe-sender";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  mailCommandContextAtom,
  senderCommandContextAtom,
} from "@/store/command-palette";
import type { ParsedMessage } from "@/utils/types";

export function useSenderCommands(
  message: Pick<ParsedMessage, "headers" | "threadId"> | null,
) {
  const { emailAccountId } = useAccount();
  const mailContext = useAtomValue(mailCommandContextAtom);
  const setSenderCommandContext = useSetAtom(senderCommandContextAtom);
  const senderActions = useUnsubscribeSender(message);
  const {
    canManageAutoArchive,
    isAutoArchived,
    isAutoArchiveStatusLoading,
    isUpdatingAutoArchive,
    isUnsubscribeDisabled,
    unsubscribeLabel,
    onToggleAutoArchive,
    onUnsubscribe,
  } = senderActions;
  const senderCommandContext = useMemo(
    () =>
      canManageAutoArchive
        ? {
            emailAccountId,
            isAutoArchived,
            isAutoArchiveDisabled:
              isAutoArchiveStatusLoading || isUpdatingAutoArchive,
            isUnsubscribeDisabled,
            unsubscribeLabel,
            threadId: message?.threadId ?? "",
            toggleAutoArchive: onToggleAutoArchive,
            unsubscribe: onUnsubscribe,
          }
        : null,
    [
      canManageAutoArchive,
      isUnsubscribeDisabled,
      unsubscribeLabel,
      emailAccountId,
      isAutoArchived,
      isAutoArchiveStatusLoading,
      isUpdatingAutoArchive,
      onToggleAutoArchive,
      onUnsubscribe,
      message?.threadId,
    ],
  );

  const isTarget =
    mailContext?.target?.emailAccountId === emailAccountId &&
    mailContext.target.threadId === message?.threadId;
  useEffect(() => {
    if (!isTarget || !senderCommandContext) return;
    setSenderCommandContext(senderCommandContext);
    return () =>
      setSenderCommandContext((current) =>
        current === senderCommandContext ? null : current,
      );
  }, [isTarget, senderCommandContext, setSenderCommandContext]);

  return senderActions;
}
