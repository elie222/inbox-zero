"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { usePremium } from "@/hooks/usePremium";
import { useAccount } from "@/providers/EmailAccountProvider";
import { decrementUnsubscribeCreditAction } from "@/utils/actions/premium";
import { unsubscribeSenderAction } from "@/utils/actions/unsubscriber";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import {
  getHttpUnsubscribeLink,
  getUserFacingUnsubscribeLink,
} from "@/utils/parse/unsubscribe";
import type { ParsedMessage } from "@/utils/types";

/**
 * Unsubscribing from a single message, for the reader.
 *
 * Only the sender's own `List-Unsubscribe` header is trusted here: the bulk
 * page can fall back to a link scraped out of the body, but that scrape happens
 * server-side while indexing senders and isn't available on an open thread.
 *
 * A one-click header is unsubscribed server-side and the sender is marked; when
 * that fails, or when the sender only offers a mailto, the user gets the link.
 */
export function useUnsubscribeSender(message: ParsedMessage | null) {
  const { emailAccountId } = useAccount();
  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  const listUnsubscribeHeader = message?.headers["list-unsubscribe"] ?? null;
  const httpLink = getHttpUnsubscribeLink({ listUnsubscribeHeader });
  const userFacingLink = getUserFacingUnsubscribeLink({
    listUnsubscribeHeader,
  });
  const from = message?.headers.from ?? "";
  const senderEmail = extractEmailAddress(from);
  const senderName = extractNameFromEmail(from);
  const canUnsubscribe = Boolean(senderEmail && userFacingLink);

  const onUnsubscribe = useCallback(async () => {
    if (!(canUnsubscribe && userFacingLink)) return;

    if (!hasUnsubscribeAccess) {
      openModal();
      return;
    }

    // Sending the user to a mailto they have to compose is the last resort: an
    // http link opens a page that finishes the job, so it wins when both exist.
    const manualLink = httpLink ?? userFacingLink;

    if (!httpLink) {
      openUnsubscribePage(userFacingLink);
      return;
    }

    const toastId = toast.loading(`Unsubscribing from ${senderName}`);
    const failed = () =>
      toast.error(`Couldn't unsubscribe from ${senderName}`, {
        id: toastId,
        action: {
          label: "Open page",
          onClick: () => openUnsubscribePage(manualLink),
        },
      });

    try {
      const result = await unsubscribeSenderAction(emailAccountId, {
        senderEmail,
        listUnsubscribeHeader,
      });
      if (!result?.data?.unsubscribe.success) {
        failed();
        return;
      }
    } catch {
      failed();
      return;
    }

    toast.success(`Unsubscribed from ${senderName}`, { id: toastId });

    // Metering happens after the fact, and neither half changes what the user
    // just saw: a failure here must not read as a failed unsubscribe.
    decrementUnsubscribeCreditAction()
      .then(() => refetchPremium())
      .catch(() => {});
  }, [
    canUnsubscribe,
    emailAccountId,
    hasUnsubscribeAccess,
    httpLink,
    listUnsubscribeHeader,
    openModal,
    refetchPremium,
    senderEmail,
    senderName,
    userFacingLink,
  ]);

  return { canUnsubscribe, onUnsubscribe, PremiumModal };
}

function openUnsubscribePage(link: string) {
  window.open(link, "_blank", "noopener,noreferrer");
}
