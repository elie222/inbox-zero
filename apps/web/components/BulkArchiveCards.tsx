"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import groupBy from "lodash/groupBy";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  MailIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmailCell } from "@/components/EmailCell";
import { useThreads } from "@/hooks/useThreads";
import { formatShortDate } from "@/utils/date";
import { cn } from "@/utils";
import { toastError } from "@/components/Toast";
import {
  addToArchiveSenderQueue,
  useArchiveSenderStatus,
} from "@/store/archive-sender-queue";
import { getEmailUrl } from "@/utils/url";
import type { CategoryWithRules } from "@/utils/category.server";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getCategoryIcon } from "@/components/bulk-archive/categoryIcons";
import { defaultCategory } from "@/utils/categories";

type EmailGroup = {
  address: string;
  category: CategoryWithRules | null;
};

export function BulkArchiveCards({
  emailGroups,
  categories,
}: {
  emailGroups: EmailGroup[];
  categories: CategoryWithRules[];
}) {
  const { emailAccountId, userEmail } = useAccount();
  const [expandedCategory, setExpandedCategory] = useQueryState("expanded");
  const [expandedSenders, setExpandedSenders] = useState<
    Record<string, boolean>
  >({});
  const [archivedCategories, setArchivedCategories] = useState<
    Record<string, boolean>
  >({});
  const [selectedSenders, setSelectedSenders] = useState<
    Record<string, boolean>
  >({});

  const categoryMap = useMemo(() => {
    return categories.reduce<Record<string, CategoryWithRules>>(
      (acc, category) => {
        acc[category.name] = category;
        return acc;
      },
      {},
    );
  }, [categories]);

  const groupedEmails = useMemo(() => {
    const grouped = groupBy(
      emailGroups,
      (group) =>
        categoryMap[group.category?.name || ""]?.name || "Uncategorized",
    );

    // Add empty arrays for categories without any emails
    for (const category of categories) {
      if (!grouped[category.name]) {
        grouped[category.name] = [];
      }
    }

    // Always show default categories with 0 senders if no categories exist
    if (categories.length === 0) {
      for (const cat of Object.values(defaultCategory)) {
        if (!grouped[cat.name]) {
          grouped[cat.name] = [];
        }
      }
    }

    return grouped;
  }, [emailGroups, categories, categoryMap]);

  // Sort categories alphabetically, but always put Other and Uncategorized last
  const sortedCategoryEntries = useMemo(() => {
    return Object.entries(groupedEmails).sort(([a], [b]) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      if (a === defaultCategory.OTHER.name) return 1;
      if (b === defaultCategory.OTHER.name) return -1;
      return a.localeCompare(b);
    });
  }, [groupedEmails]);

  const toggleCategory = (categoryName: string) => {
    if (expandedCategory !== categoryName) {
      initializeSenders(categoryName);
    }
    setExpandedCategory(
      expandedCategory === categoryName ? null : categoryName,
    );
  };

  const toggleSender = (senderAddress: string) => {
    setExpandedSenders((prev) => ({
      ...prev,
      [senderAddress]: !prev[senderAddress],
    }));
  };

  const initializeSenders = (categoryName: string) => {
    const senders = groupedEmails[categoryName] || [];
    const newSelected = { ...selectedSenders };
    for (const sender of senders) {
      if (newSelected[sender.address] === undefined) {
        newSelected[sender.address] = true;
      }
    }
    setSelectedSenders(newSelected);
  };

  const toggleSenderSelection = (
    senderAddress: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setSelectedSenders((prev) => ({
      ...prev,
      [senderAddress]: !prev[senderAddress],
    }));
  };

  const getSelectedCount = (categoryName: string) => {
    const senders = groupedEmails[categoryName] || [];
    return senders.filter((s) => selectedSenders[s.address] !== false).length;
  };

  const archiveCategory = async (categoryName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const senders = groupedEmails[categoryName] || [];
    const selectedToArchive = senders.filter(
      (s) => selectedSenders[s.address] !== false,
    );

    try {
      for (const sender of selectedToArchive) {
        await addToArchiveSenderQueue({
          sender: sender.address,
          emailAccountId,
        });
      }

      setArchivedCategories((prev) => ({ ...prev, [categoryName]: true }));
    } catch (_error) {
      toastError({
        description: "Failed to archive some senders. Please try again.",
      });
    }
  };

  return (
    <div className="space-y-3 py-4">
      {sortedCategoryEntries.map(([categoryName, senders]) => {
        const category = categoryMap[categoryName];
        const CategoryIcon = getCategoryIcon(categoryName);

        // Get default category info if no category exists
        const defaultCat = Object.values(defaultCategory).find(
          (c) => c.name === categoryName,
        );

        // Skip if no category found and not a default category (but allow Uncategorized)
        if (!category && !defaultCat && categoryName !== "Uncategorized")
          return null;

        const isExpanded = expandedCategory === categoryName;
        const isArchived = archivedCategories[categoryName];

        if (isArchived) {
          return (
            <Card key={categoryName} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 flex size-10 items-center justify-center rounded-lg bg-muted text-xl opacity-50">
                    <CategoryIcon className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-medium text-muted-foreground line-through">
                      {categoryName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {senders.length} senders archived
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-green-600">
                  <CheckIcon className="size-5" />
                  <span className="text-sm font-medium">Archived</span>
                </div>
              </div>
            </Card>
          );
        }

        return (
          <Card key={categoryName} className="overflow-hidden">
            {/* Category header - clickable to expand */}
            <div
              className="cursor-pointer p-4 transition-colors hover:bg-muted/50"
              onClick={() => toggleCategory(categoryName)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleCategory(categoryName);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 flex size-10 items-center justify-center rounded-lg bg-muted text-xl">
                    <CategoryIcon className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-medium">{categoryName}</h2>
                    <p className="text-sm text-muted-foreground">
                      {senders.length} senders
                      {(category?.description || defaultCat?.description) &&
                        ` · ${category?.description || defaultCat?.description}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={(e) => archiveCategory(categoryName, e)}
                    size="sm"
                  >
                    <ArchiveIcon className="mr-2 size-4" />
                    {isExpanded
                      ? `Archive ${getSelectedCount(categoryName)} of ${senders.length}`
                      : "Archive all"}
                  </Button>
                  <ChevronDownIcon
                    className={cn(
                      "size-5 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Expanded sender list */}
            {isExpanded && (
              <div className="border-t">
                <div className="divide-y">
                  {senders.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No senders in this category
                    </div>
                  ) : (
                    senders.map((sender) => (
                      <SenderRow
                        key={sender.address}
                        sender={sender}
                        isExpanded={!!expandedSenders[sender.address]}
                        isSelected={selectedSenders[sender.address] !== false}
                        onToggle={() => toggleSender(sender.address)}
                        onToggleSelection={(e) =>
                          toggleSenderSelection(sender.address, e)
                        }
                        userEmail={userEmail}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function SenderRow({
  sender,
  isExpanded,
  isSelected,
  onToggle,
  onToggleSelection,
  userEmail,
}: {
  sender: EmailGroup;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onToggleSelection: (e: React.MouseEvent<HTMLButtonElement>) => void;
  userEmail: string;
}) {
  const status = useArchiveSenderStatus(sender.address);

  return (
    <div className={cn(!isSelected && "opacity-50")}>
      {/* Sender row */}
      <div
        className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-muted/50"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <Checkbox
          checked={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(e);
          }}
          className="size-5"
        />
        <div className="min-w-0 flex-1">
          <EmailCell
            emailAddress={sender.address}
            className={cn(
              "flex flex-col",
              !isSelected && "text-muted-foreground line-through",
            )}
          />
        </div>
        <div className="mr-2 text-right">
          <ArchiveStatus status={status} />
        </div>
        <ChevronDownIcon
          className={cn(
            "size-5 text-muted-foreground transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </div>

      {/* Expanded email list */}
      {isExpanded && (
        <ExpandedEmails sender={sender.address} userEmail={userEmail} />
      )}
    </div>
  );
}

function ArchiveStatus({
  status,
}: {
  status: ReturnType<typeof useArchiveSenderStatus>;
}) {
  switch (status?.status) {
    case "completed":
      if (status.threadsTotal) {
        return (
          <span className="text-sm text-green-600">
            Archived {status.threadsTotal}!
          </span>
        );
      }
      return <span className="text-sm text-muted-foreground">Archived</span>;
    case "processing":
      return (
        <span className="text-sm text-blue-600">
          {status.threadsTotal - status.threadIds.length} /{" "}
          {status.threadsTotal}
        </span>
      );
    case "pending":
      return <span className="text-sm text-muted-foreground">Pending...</span>;
    default:
      return null;
  }
}

function ExpandedEmails({
  sender,
  userEmail,
}: {
  sender: string;
  userEmail: string;
}) {
  const { provider } = useAccount();

  const { data, isLoading, error } = useThreads({
    fromEmail: sender,
    limit: 5,
    type: "all",
  });

  if (isLoading) {
    return (
      <div className="border-t bg-muted/30 p-4">
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t bg-muted/30 p-4 text-sm text-muted-foreground">
        Error loading emails
      </div>
    );
  }

  if (!data?.threads.length) {
    return (
      <div className="border-t bg-muted/30 p-4 text-sm text-muted-foreground">
        No emails found
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/30">
      <div className="py-2">
        {data.threads.slice(0, 5).map((thread) => {
          const firstMessage = thread.messages[0];
          if (!firstMessage) return null;
          const subject = firstMessage.subject;
          const date = firstMessage.date;
          const snippet = thread.snippet || firstMessage.snippet;

          return (
            <div key={thread.id} className="flex">
              <div className="flex items-center pl-[26px]">
                <div className="h-full w-px bg-border" />
                <div className="h-px w-4 bg-border" />
              </div>
              <Link
                href={getEmailUrl(thread.id, userEmail, provider)}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-2 flex flex-1 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <MailIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">
                    {subject.length > 50
                      ? `${subject.slice(0, 50)}...`
                      : subject}
                  </span>
                  {snippet && (
                    <span className="ml-2 text-muted-foreground">
                      {(() => {
                        // Remove invisible/zero-width chars and normalize whitespace
                        const cleaned = snippet
                          .replace(/[\u034F\u200B-\u200D\uFEFF\u00A0]/g, "")
                          .trim()
                          .replace(/\s+/g, " ");
                        return cleaned.length > 80
                          ? `${cleaned.slice(0, 80).trimEnd()}...`
                          : cleaned;
                      })()}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatShortDate(new Date(date))}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
