"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import { usePremium } from "@/hooks/usePremium";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useArchiveSenderQueueActions } from "@/store/archive-sender-queue";
import { decrementUnsubscribeCreditAction } from "@/utils/actions/premium";
import {
  setSenderStatusAction,
  unsubscribeSenderAction,
} from "@/utils/actions/unsubscriber";
import {
  canonicalizeEmailAddress,
  extractEmailAddress,
  extractNameFromEmail,
} from "@/utils/email";
import { assertActionSucceeded, captureException } from "@/utils/error";
import { NewsletterStatus } from "@/generated/prisma/enums";
import {
  getHttpUnsubscribeLink,
  getUserFacingUnsubscribeLink,
} from "@/utils/parse/unsubscribe";
import type { ParsedMessage } from "@/utils/types";
import { createSearchParams } from "@/utils/url";

/**
 * Unsubscribing from a single message, for the reader.
 *
 * The message's `List-Unsubscribe` header is available immediately. When the
 * menu opens, the reader also checks the sender stats used by bulk unsubscribe
 * so a previously indexed link from the message body remains available here.
 *
 * A one-click header is unsubscribed server-side and the sender is marked; when
 * that fails, or when the sender only offers a mailto, the user gets the link.
 */
export function useUnsubscribeSender(
  message: ParsedMessage | null,
  { loadStoredLink = false }: { loadStoredLink?: boolean } = {},
) {
  const { emailAccountId } = useAccount();
  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();
  const { queueArchiveSenders } = useArchiveSenderQueueActions(emailAccountId);

  const listUnsubscribeHeader = message?.headers["list-unsubscribe"] ?? null;
  const headerUnsubscribeLink = getUserFacingUnsubscribeLink({
    listUnsubscribeHeader,
  });
  const from = message?.headers.from ?? "";
  const senderEmail = extractEmailAddress(from);
  const senderName = extractNameFromEmail(from);
  const senderStatsUrl = senderEmail
    ? `/api/user/stats/newsletters?${createSearchParams({
        types: [],
        search: senderEmail,
        includeMissingUnsubscribe: true,
      })}`
    : null;
  const { data: senderStats } = useSWR<NewsletterStatsResponse>(
    loadStoredLink && !headerUnsubscribeLink && senderStatsUrl
      ? [senderStatsUrl, emailAccountId]
      : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const canonicalSenderEmail = canonicalizeEmailAddress(senderEmail);
  const unsubscribeLink = senderStats?.newsletters.find(
    (sender) => sender.name === canonicalSenderEmail,
  )?.unsubscribeLink;
  const httpLink = getHttpUnsubscribeLink({
    unsubscribeLink,
    listUnsubscribeHeader,
  });
  const userFacingLink = getUserFacingUnsubscribeLink({
    unsubscribeLink,
    listUnsubscribeHeader,
  });
  const canUnsubscribe = Boolean(senderEmail && userFacingLink);
  const canAutoArchive = Boolean(senderEmail);

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
        unsubscribeLink,
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

    queueArchiveSenders({ senders: [senderEmail] }).catch(() => {});

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
    unsubscribeLink,
    userFacingLink,
    queueArchiveSenders,
  ]);

  const onAutoArchive = useCallback(async () => {
    if (!canAutoArchive) return;

    if (!hasUnsubscribeAccess) {
      openModal();
      return;
    }

    const toastId = toast.loading(`Enabling auto archive for ${senderName}`);

    try {
      const result = await setSenderStatusAction(emailAccountId, {
        senderEmail,
        status: NewsletterStatus.AUTO_ARCHIVED,
      });
      assertActionSucceeded(result);
      await decrementUnsubscribeCreditAction();
      await queueArchiveSenders({ senders: [senderEmail] });
      await refetchPremium();
      toast.success(`Future emails from ${senderName} will be archived`, {
        id: toastId,
      });
    } catch (error) {
      captureException(error);
      toast.error(`Couldn't enable auto archive for ${senderName}`, {
        id: toastId,
      });
    }
  }, [
    canAutoArchive,
    emailAccountId,
    hasUnsubscribeAccess,
    openModal,
    queueArchiveSenders,
    refetchPremium,
    senderEmail,
    senderName,
  ]);

  return {
    canAutoArchive,
    canUnsubscribe,
    onAutoArchive,
    onUnsubscribe,
    PremiumModal,
  };
}

function openUnsubscribePage(link: string) {
  window.open(link, "_blank", "noopener,noreferrer");
}
