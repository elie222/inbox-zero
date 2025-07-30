"use client";

import { useCallback, useState, useEffect } from "react";
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
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { isDefined } from "@/utils/types";
import { fetchWithAccount } from "@/utils/fetch";

async function unsubscribeAndArchive({
  newsletterEmail,
  mutate,
  refetchPremium,
  emailAccountId,
}: {
  newsletterEmail: string;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  emailAccountId: string;
}) {
  await setNewsletterStatusAction(emailAccountId, {
    newsletterEmail,
    status: NewsletterStatus.UNSUBSCRIBED,
  });
  await mutate();
  await decrementUnsubscribeCreditAction();
  await refetchPremium();
  await addToArchiveSenderQueue({
    sender: newsletterEmail,
    emailAccountId,
  });
}

export function useUnsubscribe<T extends Row>({
  item,
  emailAccountId,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
}: {
  item: T;
  emailAccountId: string;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
}) {
  const [unsubscribeLoading, setUnsubscribeLoading] = useState(false);

  const onUnsubscribe = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setUnsubscribeLoading(true);

    try {
      posthog.capture("Clicked Unsubscribe");

      if (item.status === NewsletterStatus.UNSUBSCRIBED) {
        await setNewsletterStatusAction(emailAccountId, {
          newsletterEmail: item.name,
          status: null,
        });
        await mutate();
      } else {
        await unsubscribeAndArchive({
          newsletterEmail: item.name,
          mutate,
          refetchPremium,
          emailAccountId,
        });
      }
    } catch (error) {
      captureException(error);
    }

    setUnsubscribeLoading(false);
  }, [
    hasUnsubscribeAccess,
    item.name,
    item.status,
    mutate,
    refetchPremium,
    posthog,
    emailAccountId,
  ]);

  return {
    unsubscribeLoading,
    onUnsubscribe,
    unsubscribeLink:
      hasUnsubscribeAccess && item.unsubscribeLink
        ? cleanUnsubscribeLink(item.unsubscribeLink) || "#"
        : "#",
  };
}

export function useBulkUnsubscribe<T extends Row>({
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
  emailAccountId,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
  emailAccountId: string;
}) {
  const [bulkUnsubscribeLoading, setBulkUnsubscribeLoading] = useState(false);

  const onBulkUnsubscribe = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) return;

      setBulkUnsubscribeLoading(true);

      try {
        posthog.capture("Clicked Bulk Unsubscribe");

        for (const item of items) {
          try {
            await unsubscribeAndArchive({
              newsletterEmail: item.name,
              mutate,
              refetchPremium,
              emailAccountId,
            });
          } catch (error) {
            captureException(error);
          }
        }
      } catch (error) {
        captureException(error);
      }

      setBulkUnsubscribeLoading(false);
    },
    [hasUnsubscribeAccess, mutate, posthog, refetchPremium, emailAccountId],
  );

  return {
    bulkUnsubscribeLoading,
    onBulkUnsubscribe,
  };
}

async function autoArchive({
  name,
  labelId,
  labelName,
  mutate,
  refetchPremium,
  emailAccountId,
}: {
  name: string;
  labelId: string | undefined;
  labelName: string | undefined;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  emailAccountId: string;
}) {
  await onAutoArchive({
    emailAccountId,
    from: name,
    gmailLabelId: labelId,
    labelName: labelName,
  });
  await setNewsletterStatusAction(emailAccountId, {
    newsletterEmail: name,
    status: NewsletterStatus.AUTO_ARCHIVED,
  });
  await mutate();
  await decrementUnsubscribeCreditAction();
  await refetchPremium();
  await addToArchiveSenderQueue({
    sender: name,
    labelId,
    emailAccountId,
  });
}

export function useAutoArchive<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
  emailAccountId,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
  emailAccountId: string;
}) {
  const [autoArchiveLoading, setAutoArchiveLoading] = useState(false);

  const onAutoArchiveClick = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setAutoArchiveLoading(true);

    await autoArchive({
      name: item.name,
      labelId: undefined,
      labelName: undefined,
      mutate,
      refetchPremium,
      emailAccountId,
    });

    posthog.capture("Clicked Auto Archive");

    setAutoArchiveLoading(false);
  }, [
    item.name,
    mutate,
    refetchPremium,
    hasUnsubscribeAccess,
    posthog,
    emailAccountId,
  ]);

  const onDisableAutoArchive = useCallback(async () => {
    setAutoArchiveLoading(true);

    if (item.autoArchived?.id) {
      await onDeleteFilter({
        emailAccountId,
        filterId: item.autoArchived.id,
      });
    }
    await setNewsletterStatusAction(emailAccountId, {
      newsletterEmail: item.name,
      status: null,
    });
    await mutate();

    setAutoArchiveLoading(false);
  }, [item.name, item.autoArchived?.id, mutate, emailAccountId]);

  const onAutoArchiveAndLabel = useCallback(
    async (labelId: string, labelName: string) => {
      if (!hasUnsubscribeAccess) return;

      setAutoArchiveLoading(true);

      await autoArchive({
        name: item.name,
        labelId,
        labelName,
        mutate,
        refetchPremium,
        emailAccountId,
      });

      setAutoArchiveLoading(false);
    },
    [item.name, mutate, refetchPremium, hasUnsubscribeAccess, emailAccountId],
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
  emailAccountId,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
  refetchPremium: () => Promise<any>;
  emailAccountId: string;
}) {
  const [bulkAutoArchiveLoading, setBulkAutoArchiveLoading] = useState(false);

  const onBulkAutoArchive = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) return;

      setBulkAutoArchiveLoading(true);

      for (const item of items) {
        await autoArchive({
          name: item.name,
          labelId: undefined,
          labelName: undefined,
          mutate,
          refetchPremium,
          emailAccountId,
        });
      }

      setBulkAutoArchiveLoading(false);
    },
    [hasUnsubscribeAccess, mutate, refetchPremium, emailAccountId],
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
  emailAccountId,
}: {
  item: T;
  mutate: () => Promise<void>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const [approveLoading, setApproveLoading] = useState(false);
  const { onDisableAutoArchive } = useAutoArchive({
    item,
    hasUnsubscribeAccess: true,
    mutate,
    posthog,
    refetchPremium: () => Promise.resolve(),
    emailAccountId,
  });

  const onApprove = async () => {
    setApproveLoading(true);

    await onDisableAutoArchive();
    await setNewsletterStatusAction(emailAccountId, {
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
  emailAccountId,
}: {
  mutate: () => Promise<any>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const [bulkApproveLoading, setBulkApproveLoading] = useState(false);

  const onBulkApprove = async (items: T[]) => {
    setBulkApproveLoading(true);

    posthog.capture("Clicked Bulk Approve");

    for (const item of items) {
      await setNewsletterStatusAction(emailAccountId, {
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

async function archiveAll({
  name,
  onFinish,
  emailAccountId,
}: {
  name: string;
  onFinish: () => void;
  emailAccountId: string;
}) {
  toast.promise(
    async () => {
      const threadsArchived = await new Promise<number>((resolve, reject) => {
        addToArchiveSenderQueue({
          sender: name,
          emailAccountId,
          onSuccess: (totalThreads) => {
            onFinish();
            resolve(totalThreads);
          },
          onError: reject,
        });
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
  emailAccountId,
}: {
  item: T;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);

  const onArchiveAll = async () => {
    setArchiveAllLoading(true);

    posthog.capture("Clicked Archive All");

    await archiveAll({
      name: item.name,
      onFinish: () => setArchiveAllLoading(false),
      emailAccountId,
    });

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
  emailAccountId,
}: {
  mutate: () => Promise<any>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const onBulkArchive = async (items: T[]) => {
    posthog.capture("Clicked Bulk Archive");

    for (const item of items) {
      await archiveAll({
        name: item.name,
        onFinish: mutate,
        emailAccountId,
      });
    }
  };

  return { onBulkArchive };
}

async function deleteAllFromSender({
  name,
  onFinish,
  emailAccountId,
}: {
  name: string;
  onFinish: () => void;
  emailAccountId: string;
}) {
  toast.promise(
    async () => {
      // 1. search for messages from sender
      const res = await fetchWithAccount({
        url: `/api/threads/basic?fromEmail=${name}`,
        emailAccountId,
      });
      const data: GetThreadsResponse = await res.json();

      // 2. delete messages
      if (data?.threads?.length) {
        await new Promise<void>((resolve, reject) => {
          deleteEmails({
            threadIds: data.threads.map((t) => t.id).filter(isDefined),
            onSuccess: () => {
              onFinish();
              resolve();
            },
            onError: reject,
            emailAccountId,
          });
        });
      }

      return data.threads?.length || 0;
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
  emailAccountId,
}: {
  item: T;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

  const onDeleteAll = async () => {
    setDeleteAllLoading(true);

    posthog.capture("Clicked Delete All");

    await deleteAllFromSender({
      name: item.name,
      onFinish: () => setDeleteAllLoading(false),
      emailAccountId,
    });
  };

  return {
    deleteAllLoading,
    onDeleteAll,
  };
}

export function useBulkDelete<T extends Row>({
  mutate,
  posthog,
  emailAccountId,
}: {
  mutate: () => Promise<any>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const onBulkDelete = async (items: T[]) => {
    posthog.capture("Clicked Bulk Delete");

    for (const item of items) {
      await deleteAllFromSender({
        name: item.name,
        onFinish: () => mutate(),
        emailAccountId,
      });
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
  emailAccountId,
  // userEmail,
}: {
  newsletters?: T[];
  selectedRow?: T;
  setSelectedRow: (row: T) => void;
  onOpenNewsletter: (row: T) => void;
  refetchPremium: () => Promise<any>;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
  emailAccountId: string;
  userEmail: string;
}) {
  // perform actions using keyboard shortcuts
  // TODO make this available to command-K dialog too
  // TODO limit the copy-paste. same logic appears twice in this file
  useEffect(() => {
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
        onAutoArchive({
          emailAccountId,
          from: item.name,
        });
        await setNewsletterStatusAction(emailAccountId, {
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
        if (!item.unsubscribeLink) return;
        window.open(cleanUnsubscribeLink(item.unsubscribeLink), "_blank");
        await setNewsletterStatusAction(emailAccountId, {
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
        await setNewsletterStatusAction(emailAccountId, {
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
    emailAccountId,
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
