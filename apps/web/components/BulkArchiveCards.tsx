"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import groupBy from "lodash/groupBy";
import { CheckIcon, ChevronDownIcon, MailIcon, PencilIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonCheckbox } from "@/components/ButtonCheckbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmailCell } from "@/components/EmailCell";
import { changeSenderCategoryAction } from "@/utils/actions/categorize";
import { toastError, toastSuccess } from "@/components/Toast";
import { ButtonLoader } from "@/components/Loading";
import { useThreads } from "@/hooks/useThreads";
import { formatShortDate } from "@/utils/date";
import { cn } from "@/utils";
import {
  addToArchiveSenderQueue,
  useArchiveSenderStatus,
} from "@/store/archive-sender-queue";
import {
  addToMarkReadSenderQueue,
  useMarkReadSenderStatus,
} from "@/store/mark-read-sender-queue";
import {
  type BulkActionType,
  getActionLabels,
} from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveSettingsModal";
import { getEmailUrl } from "@/utils/url";
import type { CategoryWithRules } from "@/utils/category.server";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getCategoryStyle } from "@/components/bulk-archive/categoryIcons";
import { defaultCategory } from "@/utils/categories";
import type { EmailGroup } from "@/utils/bulk-archive/get-archive-candidates";

export function BulkArchiveCards({
  emailGroups,
  categories,
  bulkAction,
  onCategoryChange,
}: {
  emailGroups: EmailGroup[];
  categories: CategoryWithRules[];
  bulkAction: BulkActionType;
  onCategoryChange?: () => Promise<unknown>;
}) {
  const { emailAccountId, userEmail } = useAccount();
  const [expandedCategory, setExpandedCategory] = useQueryState("expanded");
  const [expandedSenders, setExpandedSenders] = useState<
    Record<string, boolean>
  >({});
  const [archivedCategories, setArchivedCategories] = useState<
    Record<string, boolean>
  >({});
  const [loadingCategories, setLoadingCategories] = useState<
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

  // Get the names of default categories to determine which categories to show as separate tabs
  const defaultCategoryNames = useMemo(
    () => new Set<string>(Object.values(defaultCategory).map((c) => c.name)),
    [],
  );

  const groupedEmails = useMemo(() => {
    const grouped = groupBy(emailGroups, (group) => {
      const categoryName =
        categoryMap[group.category?.name || ""]?.name || "Uncategorized";

      // If the category is not one of the default categories, group it under "Other"
      // This handles legacy categories from before the 4+Other category system
      if (
        categoryName !== "Uncategorized" &&
        !defaultCategoryNames.has(categoryName)
      ) {
        return defaultCategory.OTHER.name;
      }

      return categoryName;
    });

    // Always show default categories (even with 0 senders)
    for (const cat of Object.values(defaultCategory)) {
      if (!grouped[cat.name]) {
        grouped[cat.name] = [];
      }
    }

    return grouped;
  }, [emailGroups, categoryMap, defaultCategoryNames]);

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

  const toggleSenderSelection = (senderAddress: string) => {
    setSelectedSenders((prev) => ({
      ...prev,
      [senderAddress]: !prev[senderAddress],
    }));
  };

  const getSelectedCount = (categoryName: string) => {
    const senders = groupedEmails[categoryName] || [];
    return senders.filter((s) => selectedSenders[s.address] !== false).length;
  };

  const areAllSelectedInCategory = (categoryName: string) => {
    const senders = groupedEmails[categoryName] || [];
    if (senders.length === 0) return false;
    return senders.every((s) => selectedSenders[s.address] !== false);
  };

  const areSomeSelectedInCategory = (categoryName: string) => {
    const senders = groupedEmails[categoryName] || [];
    const selectedCount = getSelectedCount(categoryName);
    return selectedCount > 0 && selectedCount < senders.length;
  };

  const selectAllInCategory = (categoryName: string) => {
    const senders = groupedEmails[categoryName] || [];
    setSelectedSenders((prev) => {
      const newSelected = { ...prev };
      for (const sender of senders) {
        newSelected[sender.address] = true;
      }
      return newSelected;
    });
  };

  const deselectAllInCategory = (categoryName: string) => {
    const senders = groupedEmails[categoryName] || [];
    setSelectedSenders((prev) => {
      const newSelected = { ...prev };
      for (const sender of senders) {
        newSelected[sender.address] = false;
      }
      return newSelected;
    });
  };

  const toggleSelectAllInCategory = (categoryName: string) => {
    if (areAllSelectedInCategory(categoryName)) {
      deselectAllInCategory(categoryName);
    } else {
      selectAllInCategory(categoryName);
    }
  };

  const actionLabels = getActionLabels(bulkAction);

  const handleCategoryAction = async (
    categoryName: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const senders = groupedEmails[categoryName] || [];
    const selectedToProcess = senders.filter(
      (s) => selectedSenders[s.address] !== false,
    );

    setLoadingCategories((prev) => ({ ...prev, [categoryName]: true }));

    try {
      for (const sender of selectedToProcess) {
        if (bulkAction === "markRead") {
          await addToMarkReadSenderQueue({
            sender: sender.address,
            emailAccountId,
          });
        } else {
          await addToArchiveSenderQueue({
            sender: sender.address,
            emailAccountId,
          });
        }
      }
      setArchivedCategories((prev) => ({ ...prev, [categoryName]: true }));
    } catch (_error) {
      toastError({
        description: `Failed to ${bulkAction === "markRead" ? "mark as read" : "archive"} some senders. Please try again.`,
      });
    } finally {
      setLoadingCategories((prev) => ({ ...prev, [categoryName]: false }));
    }
  };

  return (
    <div className="space-y-3 py-4">
      {sortedCategoryEntries.map(([categoryName, senders]) => {
        const category = categoryMap[categoryName];
        const categoryStyle = getCategoryStyle(categoryName);
        const CategoryIcon = categoryStyle.icon;

        // Get default category info if no category exists
        const defaultCat = Object.values(defaultCategory).find(
          (c) => c.name === categoryName,
        );

        // Skip if no category found and not a default category (but allow Uncategorized)
        if (!category && !defaultCat && categoryName !== "Uncategorized")
          return null;

        const isExpanded = expandedCategory === categoryName;
        const isArchived = archivedCategories[categoryName];
        const isLoading = loadingCategories[categoryName];

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
                  <div
                    className={cn(
                      "shrink-0 p-px rounded-lg shadow-sm bg-gradient-to-b",
                      categoryStyle.borderColor,
                      isArchived && "opacity-50",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-9 items-center justify-center rounded-[7px] bg-gradient-to-b",
                        categoryStyle.gradient,
                      )}
                    >
                      <CategoryIcon
                        className={cn("size-5", categoryStyle.iconColor)}
                      />
                    </div>
                  </div>
                  <div>
                    <h2
                      className={cn(
                        "font-medium",
                        isArchived && "text-muted-foreground line-through",
                      )}
                    >
                      {categoryName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {senders.length} senders
                      {isArchived && " archived"}
                      {!isArchived &&
                        (category?.description || defaultCat?.description) &&
                        ` · ${category?.description || defaultCat?.description}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isArchived ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckIcon className="size-5" />
                      <span className="text-sm font-medium">
                        {actionLabels.completedLabel}
                      </span>
                    </div>
                  ) : (
                    <Button
                      onClick={(e) => handleCategoryAction(categoryName, e)}
                      size="sm"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ButtonLoader />
                      ) : (
                        <actionLabels.icon className="mr-2 size-4" />
                      )}
                      {isExpanded
                        ? actionLabels.countLabel(
                            getSelectedCount(categoryName),
                            senders.length,
                          )
                        : actionLabels.allLabel}
                    </Button>
                  )}
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
                    <>
                      {/* Select all row */}
                      <div className="flex items-center gap-3 bg-muted/30 px-4 py-3">
                        <ButtonCheckbox
                          checked={areAllSelectedInCategory(categoryName)}
                          indeterminate={areSomeSelectedInCategory(
                            categoryName,
                          )}
                          onChange={() =>
                            toggleSelectAllInCategory(categoryName)
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          {getSelectedCount(categoryName)} of {senders.length}{" "}
                          selected
                        </span>
                      </div>
                      {senders.map((sender) => (
                        <SenderRow
                          key={sender.address}
                          sender={sender}
                          isExpanded={!!expandedSenders[sender.address]}
                          isSelected={selectedSenders[sender.address] !== false}
                          onToggle={() => toggleSender(sender.address)}
                          onToggleSelection={() =>
                            toggleSenderSelection(sender.address)
                          }
                          userEmail={userEmail}
                          categories={categories}
                          emailAccountId={emailAccountId}
                          onCategoryChange={onCategoryChange}
                        />
                      ))}
                    </>
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
  categories,
  emailAccountId,
  onCategoryChange,
}: {
  sender: EmailGroup;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onToggleSelection: () => void;
  userEmail: string;
  categories: CategoryWithRules[];
  emailAccountId: string;
  onCategoryChange?: () => Promise<unknown>;
}) {
  const archiveStatus = useArchiveSenderStatus(sender.address);
  const markReadStatus = useMarkReadSenderStatus(sender.address);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  return (
    <div>
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
        <ButtonCheckbox
          checked={isSelected}
          onChange={() => onToggleSelection()}
        />
        <div className="min-w-0 flex-1">
          <EmailCell
            emailAddress={sender.address}
            name={sender.name}
            className="flex flex-col"
          />
        </div>
        <div className="mr-2 text-right">
          <SenderStatus
            archiveStatus={archiveStatus}
            markReadStatus={markReadStatus}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setEditDialogOpen(true);
          }}
        >
          <PencilIcon className="size-4" />
          <span className="sr-only">Edit category</span>
        </Button>
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

      {/* Edit category dialog */}
      <EditCategoryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        sender={sender}
        categories={categories}
        emailAccountId={emailAccountId}
        onCategoryChange={onCategoryChange}
      />
    </div>
  );
}

function EditCategoryDialog({
  open,
  onOpenChange,
  sender,
  categories,
  emailAccountId,
  onCategoryChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sender: EmailGroup;
  categories: CategoryWithRules[];
  emailAccountId: string;
  onCategoryChange?: () => Promise<unknown>;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    sender.category?.id || "",
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!selectedCategoryId) return;

    setIsLoading(true);
    const result = await changeSenderCategoryAction(emailAccountId, {
      sender: sender.address,
      categoryId: selectedCategoryId,
    });

    if (result?.serverError) {
      toastError({ description: result.serverError });
      setIsLoading(false);
    } else {
      toastSuccess({ description: "Category updated" });
      await onCategoryChange?.();
      setIsLoading(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sender.name || sender.address}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-8">
            <div className="space-y-1">
              <p className="font-medium">Category</p>
              <p className="text-sm text-muted-foreground">
                Choose which category this sender belongs to
              </p>
            </div>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
            >
              <SelectTrigger className="w-[180px] shrink-0">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SenderStatus({
  archiveStatus,
  markReadStatus,
}: {
  archiveStatus: ReturnType<typeof useArchiveSenderStatus>;
  markReadStatus: ReturnType<typeof useMarkReadSenderStatus>;
}) {
  // Show archive status if it exists
  if (archiveStatus?.status) {
    switch (archiveStatus.status) {
      case "completed":
        return (
          <span className="text-sm text-green-600">
            {archiveStatus.threadsTotal
              ? `Archived ${archiveStatus.threadsTotal}!`
              : "Archived"}
          </span>
        );
      case "processing":
        return (
          <span className="text-sm text-blue-600">
            {archiveStatus.threadsTotal - archiveStatus.threadIds.length} /{" "}
            {archiveStatus.threadsTotal}
          </span>
        );
      case "pending":
        return (
          <span className="text-sm text-muted-foreground">Pending...</span>
        );
    }
  }

  // Show mark read status if it exists
  if (markReadStatus?.status) {
    switch (markReadStatus.status) {
      case "completed":
        return (
          <span className="text-sm text-green-600">
            {markReadStatus.threadsTotal
              ? `Marked ${markReadStatus.threadsTotal} read!`
              : "Marked read"}
          </span>
        );
      case "processing":
        return (
          <span className="text-sm text-blue-600">
            {markReadStatus.threadsTotal - markReadStatus.threadIds.length} /{" "}
            {markReadStatus.threadsTotal}
          </span>
        );
      case "pending":
        return (
          <span className="text-sm text-muted-foreground">Pending...</span>
        );
    }
  }

  return null;
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
