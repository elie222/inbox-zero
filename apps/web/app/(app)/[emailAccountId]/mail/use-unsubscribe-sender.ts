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
  // Only ever asked whether it exists: the request itself is made server-side
  // from the header, so the URL never has to reach the browser.
  const hasOneClickLink = Boolean(
    getHttpUnsubscribeLink({ listUnsubscribeHeader }),
  );
  const userFacingLink = getUserFacingUnsubscribeLink({
    listUnsubscribeHeader,
  });
  const from = message?.headers.from ?? "";
  const senderEmail = extractEmailAddress(from);
  const senderName = extractNameFromEmail(from);
  const canUnsubscribe = Boolean(senderEmail && userFacingLink);

  const onUnsubscribe = useCallback(() => {
    if (!(canUnsubscribe && userFacingLink)) return;

    if (!hasUnsubscribeAccess) {
      openModal();
      return;
    }

    if (!hasOneClickLink) {
      openUnsubscribePage(userFacingLink);
      return;
    }

    const toastId = toast.loading(`Unsubscribing from ${senderName}`);

    unsubscribeSenderAction(emailAccountId, {
      senderEmail,
      listUnsubscribeHeader,
    })
      .then(async (result) => {
        if (!result?.data?.unsubscribe.success) {
          toast.error(`Couldn't unsubscribe from ${senderName}`, {
            id: toastId,
            action: {
              label: "Open page",
              onClick: () => openUnsubscribePage(userFacingLink),
            },
          });
          return;
        }

        await decrementUnsubscribeCreditAction();
        toast.success(`Unsubscribed from ${senderName}`, { id: toastId });
        // A stale credit count is cosmetic: never let refreshing it turn an
        // unsubscribe that already succeeded into an error.
        refetchPremium().catch(() => {});
      })
      .catch(() => {
        toast.error(`Couldn't unsubscribe from ${senderName}`, { id: toastId });
      });
  }, [
    canUnsubscribe,
    emailAccountId,
    hasOneClickLink,
    hasUnsubscribeAccess,
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
