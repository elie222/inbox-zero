"use client";

import React, { useCallback, useState } from "react";
import { toast } from "sonner";
import type { PostHog } from "posthog-js/react";
import { onAutoArchive, onDeleteFilter } from "@/utils/actions/client";
import { setNewsletterStatusAction } from "@/utils/actions/unsubscriber";
import { decrementUnsubscribeCreditAction } from "@/utils/actions/premium";
import { NewsletterStatus } from "@prisma/client";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";
import { captureException } from "@/utils/error";
import { addToArchiveSenderQueue } from "@/store/archive-sender-queue";
import { deleteEmails } from "@/store/archive-queue";
import type { Row } from "@/app/(app)/bulk-unsubscribe/types";
import type { GetThreadsResponse } from "@/app/api/google/threads/basic/route";
import { isDefined } from "@/utils/types";

async function unsubscribeAndArchive(
  newsletterEmail: string,
  mutate: () => Promise<void>,
  refetchPremium: () => Promise<any>,
) {
  await setNewsletterStatusAction({
    newsletterEmail,
    status: NewsletterStatus.UNSUBSCRIBED,
  });
  await mutate();
  await decrementUnsubscribeCreditAction();
  await refetchPremium();
  await addToArchiveSenderQueue(newsletterEmail);
}

export function useUnsubscribe<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
}) {
  const [unsubscribeLoading, setUnsubscribeLoading] = React.useState(false);

  const onUnsubscribe = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setUnsubscribeLoading(true);

    try {
      posthog.capture("Clicked Unsubscribe");

      if (item.status === NewsletterStatus.UNSUBSCRIBED) {
        await setNewsletterStatusAction({
          newsletterEmail: item.name,
          status: null,
        });
        await mutate();
      } else {
        await unsubscribeAndArchive(item.name, mutate, refetchPremium);
      }
    } catch (error) {
      captureException(error);
      console.error(error);
    }

    setUnsubscribeLoading(false);
  }, [
    hasUnsubscribeAccess,
    item.name,
    item.status,
    mutate,
    refetchPremium,
    posthog,
  ]);

  return {
    unsubscribeLoading,
    onUnsubscribe,
    unsubscribeLink:
      hasUnsubscribeAccess && item.lastUnsubscribeLink
        ? cleanUnsubscribeLink(item.lastUnsubscribeLink) || "#"
        : "#",
  };
}

export function useBulkUnsubscribe<T extends Row>({
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
}) {
  const [bulkUnsubscribeLoading, setBulkUnsubscribeLoading] =
    React.useState(false);

  const onBulkUnsubscribe = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) return;

      setBulkUnsubscribeLoading(true);

      try {
        posthog.capture("Clicked Bulk Unsubscribe");

        for (const item of items) {
          try {
            await unsubscribeAndArchive(item.name, mutate, refetchPremium);
          } catch (error) {
            captureException(error);
            console.error(error);
          }
        }
      } catch (error) {
        captureException(error);
        console.error(error);
      }

      setBulkUnsubscribeLoading(false);
    },
    [hasUnsubscribeAccess, mutate, posthog, refetchPremium],
  );

  return {
    bulkUnsubscribeLoading,
    onBulkUnsubscribe,
  };
}

async function autoArchive(
  name: string,
  labelId: string | undefined,
  mutate: () => Promise<void>,
  refetchPremium: () => Promise<any>,
) {
  await onAutoArchive(name, labelId);
  await setNewsletterStatusAction({
    newsletterEmail: name,
    status: NewsletterStatus.AUTO_ARCHIVED,
  });
  await mutate();
  await decrementUnsubscribeCreditAction();
  await refetchPremium();
  await addToArchiveSenderQueue(name, labelId);
}

export function useAutoArchive<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
}) {
  const [autoArchiveLoading, setAutoArchiveLoading] = React.useState(false);

  const onAutoArchiveClick = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setAutoArchiveLoading(true);

    await autoArchive(item.name, undefined, mutate, refetchPremium);

    posthog.capture("Clicked Auto Archive");

    setAutoArchiveLoading(false);
  }, [item.name, mutate, refetchPremium, hasUnsubscribeAccess, posthog]);

  const onDisableAutoArchive = useCallback(async () => {
    setAutoArchiveLoading(true);

    if (item.autoArchived?.id) {
      await onDeleteFilter(item.autoArchived?.id);
    }
    await setNewsletterStatusAction({
      newsletterEmail: item.name,
      status: null,
    });
    await mutate();

    setAutoArchiveLoading(false);
  }, [item.name, item.autoArchived?.id, mutate]);

  const onAutoArchiveAndLabel = useCallback(
    async (labelId: string) => {
      if (!hasUnsubscribeAccess) return;

      setAutoArchiveLoading(true);

      await autoArchive(item.name, labelId, mutate, refetchPremium);

      setAutoArchiveLoading(false);
    },
    [item.name, mutate, refetchPremium, hasUnsubscribeAccess],
  );

  return {
    autoArchiveLoading,
    onAutoArchive: onAutoArchiveClick,
    onDisableAutoArchive,
    onAutoArchiveAndLabel,
  };
}

export function useBulkAutoArchive<T extends Row>({
  hasUnsubscribeAccess,
  mutate,
  refetchPremium,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
  refetchPremium: () => Promise<any>;
}) {
  const [bulkAutoArchiveLoading, setBulkAutoArchiveLoading] =
    React.useState(false);

  const onBulkAutoArchive = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) return;

      setBulkAutoArchiveLoading(true);

      for (const item of items) {
        await autoArchive(item.name, undefined, mutate, refetchPremium);
      }

      setBulkAutoArchiveLoading(false);
    },
    [hasUnsubscribeAccess, mutate, refetchPremium],
  );

  return {
    bulkAutoArchiveLoading,
    onBulkAutoArchive,
  };
}

export function useApproveButton<T extends Row>({
  item,
  mutate,
  posthog,
}: {
  item: T;
  mutate: () => Promise<void>;
  posthog: PostHog;
}) {
  const [approveLoading, setApproveLoading] = React.useState(false);
  const { onDisableAutoArchive } = useAutoArchive({
    item,
    hasUnsubscribeAccess: true,
    mutate,
    posthog,
    refetchPremium: () => Promise.resolve(),
  });

  const onApprove = async () => {
    setApproveLoading(true);

    await onDisableAutoArchive();
    await setNewsletterStatusAction({
      newsletterEmail: item.name,
      status: NewsletterStatus.APPROVED,
    });
    await mutate();

    posthog.capture("Clicked Approve Sender");

    setApproveLoading(false);
  };

  return {
    approveLoading,
    onApprove,
  };
}

export function useBulkApprove<T extends Row>({
  mutate,
  posthog,
}: {
  mutate: () => Promise<any>;
  posthog: PostHog;
}) {
  const [bulkApproveLoading, setBulkApproveLoading] = React.useState(false);

  const onBulkApprove = async (items: T[]) => {
    setBulkApproveLoading(true);

    posthog.capture("Clicked Bulk Approve");

    for (const item of items) {
      await setNewsletterStatusAction({
        newsletterEmail: item.name,
        status: NewsletterStatus.APPROVED,
      });
      await mutate();
    }

    setBulkApproveLoading(false);
  };

  return {
    bulkApproveLoading,
    onBulkApprove,
  };
}

async function archiveAll(name: string, onFinish: () => void) {
  toast.promise(
    async () => {
      const threadsArchived = await new Promise<number>((resolve, reject) => {
        addToArchiveSenderQueue(
          name,
          undefined,
          (totalThreads) => {
            onFinish();
            resolve(totalThreads);
          },
          reject,
        );
      });

      return threadsArchived;
    },
    {
      loading: `Archiving all emails from ${name}`,
      success: (data) =>
        data
          ? `Archived ${data} emails from ${name}`
          : `No emails to archive from ${name}`,
      error: `There was an error archiving the emails from ${name} :(`,
    },
  );
}

export function useArchiveAll<T extends Row>({
  item,
  posthog,
}: {
  item: T;
  posthog: PostHog;
}) {
  const [archiveAllLoading, setArchiveAllLoading] = React.useState(false);

  const onArchiveAll = async () => {
    setArchiveAllLoading(true);

    posthog.capture("Clicked Archive All");

    await archiveAll(item.name, () => setArchiveAllLoading(false));

    setArchiveAllLoading(false);
  };

  return {
    archiveAllLoading,
    onArchiveAll,
  };
}

export function useBulkArchive<T extends Row>({
  mutate,
  posthog,
}: {
  mutate: () => Promise<any>;
  posthog: PostHog;
}) {
  const onBulkArchive = async (items: T[]) => {
    posthog.capture("Clicked Bulk Archive");

    for (const item of items) {
      await archiveAll(item.name, mutate);
    }
  };

  return { onBulkArchive };
}

async function deleteAllFromSender(name: string, onFinish: () => void) {
  toast.promise(
    async () => {
      // 1. search gmail for messages from sender
      const res = await fetch(`/api/google/threads/basic?from=${name}`);
      const data: GetThreadsResponse = await res.json();

      // 2. delete messages
      if (data?.length) {
        await new Promise<void>((resolve, reject) => {
          deleteEmails(
            data.map((t) => t.id).filter(isDefined),
            () => {
              onFinish();
              resolve();
            },
            reject,
          );
        });
      }

      return data.length;
    },
    {
      loading: `Deleting all emails from ${name}`,
      success: (data) =>
        data
          ? `Deleting ${data} emails from ${name}...`
          : `No emails to delete from ${name}`,
      error: `There was an error deleting the emails from ${name} :(`,
    },
  );
}

export function useDeleteAllFromSender<T extends Row>({
  item,
  posthog,
}: {
  item: T;
  posthog: PostHog;
}) {
  const [deleteAllLoading, setDeleteAllLoading] = React.useState(false);

  const onDeleteAll = async () => {
    setDeleteAllLoading(true);

    posthog.capture("Clicked Delete All");

    await deleteAllFromSender(item.name, () => setDeleteAllLoading(false));
  };

  return {
    deleteAllLoading,
    onDeleteAll,
  };
}

export function useBulkDelete<T extends Row>({
  mutate,
  posthog,
}: {
  mutate: () => Promise<any>;
  posthog: PostHog;
}) {
  const onBulkDelete = async (items: T[]) => {
    posthog.capture("Clicked Bulk Delete");

    for (const item of items) {
      await deleteAllFromSender(item.name, mutate);
    }
  };

  return { onBulkDelete };
}

export function useBulkUnsubscribeShortcuts<T extends Row>({
  newsletters,
  selectedRow,
  onOpenNewsletter,
  setSelectedRow,
  refetchPremium,
  hasUnsubscribeAccess,
  mutate,
}: {
  newsletters?: T[];
  selectedRow?: T;
  setSelectedRow: (row: T) => void;
  onOpenNewsletter: (row: T) => void;
  refetchPremium: () => Promise<any>;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
}) {
  // perform actions using keyboard shortcuts
  // TODO make this available to command-K dialog too
  // TODO limit the copy-paste. same logic appears twice in this file
  React.useEffect(() => {
    const down = async (e: KeyboardEvent) => {
      const item = selectedRow;
      if (!item) return;

      // to prevent when typing in an input such as Crisp support
      if (document?.activeElement?.tagName !== "BODY") return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const index = newsletters?.findIndex((n) => n.name === item.name);
        if (index === undefined) return;
        const nextItem =
          newsletters?.[index + (e.key === "ArrowDown" ? 1 : -1)];
        if (!nextItem) return;
        setSelectedRow(nextItem);
        return;
      }
      if (e.key === "Enter") {
        // open modal
        e.preventDefault();
        onOpenNewsletter(item);
        return;
      }

      if (!hasUnsubscribeAccess) return;

      if (e.key === "e") {
        // auto archive
        e.preventDefault();
        onAutoArchive(item.name);
        await setNewsletterStatusAction({
          newsletterEmail: item.name,
          status: NewsletterStatus.AUTO_ARCHIVED,
        });
        await mutate();
        await decrementUnsubscribeCreditAction();
        await refetchPremium();
        return;
      }
      if (e.key === "u") {
        // unsubscribe
        e.preventDefault();
        if (!item.lastUnsubscribeLink) return;
        window.open(cleanUnsubscribeLink(item.lastUnsubscribeLink), "_blank");
        await setNewsletterStatusAction({
          newsletterEmail: item.name,
          status: NewsletterStatus.UNSUBSCRIBED,
        });
        await mutate();
        await decrementUnsubscribeCreditAction();
        await refetchPremium();
        return;
      }
      if (e.key === "a") {
        // approve
        e.preventDefault();
        await setNewsletterStatusAction({
          newsletterEmail: item.name,
          status: NewsletterStatus.APPROVED,
        });
        await mutate();
        return;
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [
    mutate,
    newsletters,
    selectedRow,
    hasUnsubscribeAccess,
    refetchPremium,
    setSelectedRow,
    onOpenNewsletter,
  ]);
}

export function useNewsletterFilter() {
  const [filters, setFilters] = useState<
    Record<"unhandled" | "unsubscribed" | "autoArchived" | "approved", boolean>
  >({
    unhandled: true,
    unsubscribed: true,
    autoArchived: true,
    approved: true,
  });

  return {
    filters,
    filtersArray: Object.entries(filters)
      .filter(([, selected]) => selected)
      .map(([key]) => key) as (
      | "unhandled"
      | "unsubscribed"
      | "autoArchived"
      | "approved"
    )[],
    setFilters,
  };
}
