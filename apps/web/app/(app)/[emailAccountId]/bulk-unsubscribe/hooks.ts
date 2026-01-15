"use client";

import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { useAction } from "next-safe-action/hooks";
import type { PostHog } from "posthog-js/react";
import { onAutoArchive, onDeleteFilter } from "@/utils/actions/client";
import { setNewsletterStatusAction } from "@/utils/actions/unsubscriber";
import { decrementUnsubscribeCreditAction } from "@/utils/actions/premium";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";
import { captureException } from "@/utils/error";
import { addToArchiveSenderQueue } from "@/store/archive-sender-queue";
import { deleteEmails } from "@/store/archive-queue";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { isDefined } from "@/utils/types";
import { fetchWithAccount } from "@/utils/fetch";
import type { UserResponse } from "@/app/api/user/me/route";
import {
  bulkArchiveAction,
  bulkTrashAction,
} from "@/utils/actions/mail-bulk-action";

export type NewsletterFilterType =
  | "all"
  | "unhandled"
  | "unsubscribed"
  | "autoArchived"
  | "approved";

// Shared type for SWR mutate function
type MutateFn = (
  // biome-ignore lint/suspicious/noExplicitAny: SWR mutate signature
  data?: any,
  opts?: { revalidate?: boolean },
) => Promise<void>;

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function formatSenderNames<T extends Row>(items: T[]): string {
  const names = items.map((item) => item.name);
  return names.length > 3
    ? `${names.slice(0, 3).join(", ")}...`
    : names.join(", ");
}

function itemMatchesFilter(
  status: NewsletterStatus | null | undefined,
  filter: NewsletterFilterType,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unhandled":
      return !status; // null/undefined status means unhandled
    case "unsubscribed":
      return status === NewsletterStatus.UNSUBSCRIBED;
    case "autoArchived":
      return status === NewsletterStatus.AUTO_ARCHIVED;
    case "approved":
      return status === NewsletterStatus.APPROVED;
    default:
      return true;
  }
}

// Generic bulk operation handler to reduce duplication
async function executeBulkOperation<T extends Row>({
  items,
  mutate,
  filter,
  onDeselectItem,
  processItem,
  newStatus,
  loadingMessage,
  successMessage,
  errorMessage,
  onComplete,
}: {
  items: T[];
  mutate: MutateFn;
  filter: NewsletterFilterType;
  onDeselectItem?: (id: string) => void;
  processItem: (item: T) => Promise<void>;
  newStatus: NewsletterStatus | null;
  loadingMessage: string;
  successMessage: string;
  errorMessage: string;
  onComplete?: () => Promise<unknown>;
}) {
  const total = items.length;
  const toastId = toast.loading(
    `${loadingMessage} ${total} ${pluralize(total, "sender")}...`,
    { description: `0 of ${total} completed` },
  );

  let completed = 0;
  const failures: Error[] = [];

  const updateItemOptimistically = (itemName: string) => {
    mutate(
      // biome-ignore lint/suspicious/noExplicitAny: SWR data structure
      (currentData: any) => {
        if (!currentData?.newsletters) return currentData;
        return {
          ...currentData,
          newsletters: currentData.newsletters
            // biome-ignore lint/suspicious/noExplicitAny: newsletter type
            .map((n: any) =>
              n.name === itemName ? { ...n, status: newStatus } : n,
            )
            // biome-ignore lint/suspicious/noExplicitAny: newsletter type
            .filter((n: any) => itemMatchesFilter(n.status, filter)),
        };
      },
      { revalidate: false },
    );
  };

  for (const item of items) {
    onDeselectItem?.(item.name);
    updateItemOptimistically(item.name);

    try {
      await processItem(item);
    } catch (error) {
      failures.push(error as Error);
      captureException(error);
    } finally {
      completed++;
      toast.loading(
        `${loadingMessage} ${total} ${pluralize(total, "sender")}...`,
        {
          id: toastId,
          description: `${completed} of ${total} completed`,
        },
      );
    }
  }

  if (onComplete) {
    try {
      await onComplete();
    } catch (error) {
      captureException(error);
    }
  }

  if (failures.length > 0) {
    await mutate();
    toast.error(
      `${errorMessage} ${failures.length} ${pluralize(failures.length, "sender")}`,
      {
        id: toastId,
        description: `${total - failures.length} of ${total} succeeded`,
      },
    );
  } else {
    toast.success(`${total} ${pluralize(total, "sender")} ${successMessage}`, {
      id: toastId,
      description: undefined,
    });
  }
}

async function unsubscribeAndArchive({
  newsletterEmail,
  mutate,
  refetchPremium,
  emailAccountId,
}: {
  newsletterEmail: string;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
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
  refetchPremium: () => Promise<UserResponse | null | undefined>;
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
  onDeselectItem,
  filter,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: MutateFn;
  posthog: PostHog;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  emailAccountId: string;
  onDeselectItem?: (id: string) => void;
  filter: NewsletterFilterType;
}) {
  const onBulkUnsubscribe = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) return;
      posthog.capture("Clicked Bulk Unsubscribe");

      await executeBulkOperation({
        items,
        mutate,
        filter,
        onDeselectItem,
        newStatus: NewsletterStatus.UNSUBSCRIBED,
        loadingMessage: "Unsubscribing from",
        successMessage: "unsubscribed",
        errorMessage: "Failed to unsubscribe from",
        processItem: async (item) => {
          await setNewsletterStatusAction(emailAccountId, {
            newsletterEmail: item.name,
            status: NewsletterStatus.UNSUBSCRIBED,
          });
          await decrementUnsubscribeCreditAction();
          await addToArchiveSenderQueue({
            sender: item.name,
            emailAccountId,
          });
        },
        onComplete: refetchPremium,
      });
    },
    [
      hasUnsubscribeAccess,
      mutate,
      posthog,
      refetchPremium,
      emailAccountId,
      onDeselectItem,
      filter,
    ],
  );

  return { onBulkUnsubscribe };
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
  refetchPremium: () => Promise<UserResponse | null | undefined>;
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
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
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
  onDeselectItem,
  filter,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: MutateFn;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  emailAccountId: string;
  onDeselectItem?: (id: string) => void;
  filter: NewsletterFilterType;
}) {
  const onBulkAutoArchive = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) return;

      await executeBulkOperation({
        items,
        mutate,
        filter,
        onDeselectItem,
        newStatus: NewsletterStatus.AUTO_ARCHIVED,
        loadingMessage: "Setting skip inbox for",
        successMessage: "set to skip inbox",
        errorMessage: "Failed to set skip inbox for",
        processItem: async (item) => {
          await onAutoArchive({
            emailAccountId,
            from: item.name,
            gmailLabelId: undefined,
            labelName: undefined,
          });
          await setNewsletterStatusAction(emailAccountId, {
            newsletterEmail: item.name,
            status: NewsletterStatus.AUTO_ARCHIVED,
          });
          await decrementUnsubscribeCreditAction();
          await addToArchiveSenderQueue({
            sender: item.name,
            labelId: undefined,
            emailAccountId,
          });
        },
        onComplete: refetchPremium,
      });
    },
    [
      hasUnsubscribeAccess,
      mutate,
      refetchPremium,
      emailAccountId,
      onDeselectItem,
      filter,
    ],
  );

  return { onBulkAutoArchive };
}

export function useApproveButton<T extends Row>({
  item,
  mutate,
  posthog,
  emailAccountId,
  filter,
}: {
  item: T;
  mutate: (
    // biome-ignore lint/suspicious/noExplicitAny: SWR mutate signature
    data?: any,
    opts?: {
      revalidate?: boolean;
      // biome-ignore lint/suspicious/noExplicitAny: SWR optimisticData can be any shape
      optimisticData?: any;
      rollbackOnError?: boolean;
    },
  ) => Promise<void>;
  posthog: PostHog;
  emailAccountId: string;
  filter: NewsletterFilterType;
}) {
  const [optimisticStatus, setOptimisticStatus] = useState<
    NewsletterStatus | null | undefined
  >(undefined);

  // Reset optimistic state when item.status changes (after mutate)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when item.status changes
  useEffect(() => {
    setOptimisticStatus(undefined);
  }, [item.status]);

  const onApprove = async () => {
    const previousStatus = item.status;
    const newStatus =
      item.status === NewsletterStatus.APPROVED
        ? null
        : NewsletterStatus.APPROVED;

    // Optimistically update the UI
    setOptimisticStatus(newStatus);

    // Optimistically update status and filter out items that no longer match the current view
    // biome-ignore lint/suspicious/noExplicitAny: SWR data structure
    const optimisticUpdate = (currentData: any) => {
      if (!currentData?.newsletters) return currentData;
      return {
        ...currentData,
        newsletters: currentData.newsletters
          .map(
            // biome-ignore lint/suspicious/noExplicitAny: newsletter type
            (n: any) =>
              n.name === item.name ? { ...n, status: newStatus } : n,
          )
          // biome-ignore lint/suspicious/noExplicitAny: newsletter type
          .filter((n: any) => itemMatchesFilter(n.status, filter)),
      };
    };

    // Show toast optimistically
    if (newStatus === NewsletterStatus.APPROVED) {
      toast.success("Sender approved", {
        description: item.name,
      });
    } else {
      toast.success("Sender unapproved", {
        description: item.name,
      });
    }

    // Start optimistic update immediately (don't await - fire and forget for UI)
    mutate(optimisticUpdate, { revalidate: false });

    posthog.capture("Clicked Approve Sender");

    try {
      // Delete any existing auto-archive filter without triggering a refetch
      if (item.autoArchived?.id) {
        await onDeleteFilter({
          emailAccountId,
          filterId: item.autoArchived.id,
        });
      }
      // Set the new status
      await setNewsletterStatusAction(emailAccountId, {
        newsletterEmail: item.name,
        status: newStatus,
      });
      // Don't revalidate - the optimistic update is correct
    } catch (error) {
      // Revert on error by revalidating
      setOptimisticStatus(previousStatus);
      await mutate();
      captureException(error);
      toast.error("Failed to update sender status");
    }
  };

  // Use optimistic status if set, otherwise use the actual item status
  const displayStatus =
    optimisticStatus !== undefined ? optimisticStatus : item.status;

  return {
    approveLoading: false,
    onApprove,
    isApproved: displayStatus === NewsletterStatus.APPROVED,
  };
}

export function useBulkApprove<T extends Row>({
  mutate,
  posthog,
  emailAccountId,
  onDeselectItem,
  filter,
}: {
  mutate: MutateFn;
  posthog: PostHog;
  emailAccountId: string;
  onDeselectItem?: (id: string) => void;
  filter: NewsletterFilterType;
}) {
  const onBulkApprove = async (items: T[], unapprove?: boolean) => {
    posthog.capture(
      unapprove ? "Clicked Bulk Unapprove" : "Clicked Bulk Approve",
    );

    const newStatus = unapprove ? null : NewsletterStatus.APPROVED;
    const actionPast = unapprove ? "unapproved" : "approved";

    await executeBulkOperation({
      items,
      mutate,
      filter,
      onDeselectItem,
      newStatus,
      loadingMessage: unapprove ? "Unapproving" : "Approving",
      successMessage: actionPast,
      errorMessage: `Failed to ${unapprove ? "unapprove" : "approve"}`,
      processItem: async (item) => {
        await setNewsletterStatusAction(emailAccountId, {
          newsletterEmail: item.name,
          status: newStatus,
        });
      },
    });
  };

  return { onBulkApprove };
}

export function useBulkArchive<T extends Row>({
  mutate,
  posthog,
  emailAccountId,
}: {
  mutate: () => Promise<void>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const { executeAsync: executeBulkArchive, isExecuting } = useAction(
    bulkArchiveAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
    },
  );

  const onBulkArchive = (items: T[]) => {
    posthog.capture("Clicked Bulk Archive");
    const promise = executeBulkArchive({
      froms: items.map((item) => item.name),
    });

    const displayNames = formatSenderNames(items);

    toast.promise(promise, {
      loading: `Archiving emails from ${displayNames}...`,
      success: `Archived emails from ${displayNames}`,
      error: (error) =>
        error?.error?.serverError || "There was an error archiving the emails",
    });
  };

  return { onBulkArchive, isBulkArchiving: isExecuting };
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
  mutate: () => Promise<void>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const { executeAsync: executeBulkTrash, isExecuting } = useAction(
    bulkTrashAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
    },
  );

  const onBulkDelete = (items: T[]) => {
    posthog.capture("Clicked Bulk Delete");

    const promise = executeBulkTrash({ froms: items.map((item) => item.name) });

    const displayNames = formatSenderNames(items);

    toast.promise(promise, {
      loading: `Deleting emails from ${displayNames}...`,
      success: `Deleted emails from ${displayNames}`,
      error: (error) =>
        error?.error?.serverError || "There was an error trashing the emails",
    });
  };

  return { onBulkDelete, isBulkDeleting: isExecuting };
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
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  hasUnsubscribeAccess: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: simplest
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
  const [filter, setFilter] = useState<NewsletterFilterType>("unhandled");

  // Convert single filter to array format for API compatibility
  const filtersArray: (
    | "unhandled"
    | "unsubscribed"
    | "autoArchived"
    | "approved"
  )[] =
    filter === "all"
      ? ["unhandled", "unsubscribed", "autoArchived", "approved"]
      : [filter];

  return {
    filter,
    filtersArray,
    setFilter,
  };
}
