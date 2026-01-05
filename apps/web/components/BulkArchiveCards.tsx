"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import groupBy from "lodash/groupBy";
import {
  ArchiveIcon,
  BellIcon,
  BookmarkXIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  CodeIcon,
  CreditCardIcon,
  GlobeIcon,
  HeadphonesIcon,
  MailIcon,
  MegaphoneIcon,
  MoreVerticalIcon,
  NewspaperIcon,
  PencilIcon,
  ReceiptIcon,
  ScaleIcon,
  ShoppingCartIcon,
  TagIcon,
  UserIcon,
  UserCircleIcon,
  UsersIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmailCell } from "@/components/EmailCell";
import { useThreads } from "@/hooks/useThreads";
import { formatShortDate } from "@/utils/date";
import { cn } from "@/utils";
import { removeAllFromCategoryAction } from "@/utils/actions/categorize";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  addToArchiveSenderQueue,
  useArchiveSenderStatus,
} from "@/store/archive-sender-queue";
import { getEmailUrl } from "@/utils/url";
import { CreateCategoryDialog } from "@/app/(app)/[emailAccountId]/smart-categories/CreateCategoryButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryWithRules } from "@/utils/category.server";
import { useAccount } from "@/providers/EmailAccountProvider";

type EmailGroup = {
  address: string;
  category: CategoryWithRules | null;
};

// Get icon for category based on name
function getCategoryIcon(categoryName: string) {
  const name = categoryName.toLowerCase();

  if (name.includes("newsletter")) return NewspaperIcon;
  if (name.includes("marketing") || name.includes("promotion"))
    return MegaphoneIcon;
  if (name.includes("notification") || name.includes("alert")) return BellIcon;
  if (name.includes("receipt") || name.includes("invoice")) return ReceiptIcon;
  if (name.includes("social") || name.includes("team")) return UsersIcon;
  if (name.includes("shopping") || name.includes("order"))
    return ShoppingCartIcon;
  if (name.includes("finance") || name.includes("bank") || name.includes("pay"))
    return CreditCardIcon;
  if (name.includes("work") || name.includes("job") || name.includes("career"))
    return BriefcaseIcon;
  if (
    name.includes("developer") ||
    name.includes("github") ||
    name.includes("code")
  )
    return CodeIcon;
  if (name.includes("travel") || name.includes("flight")) return GlobeIcon;
  if (
    name.includes("sale") ||
    name.includes("deal") ||
    name.includes("discount")
  )
    return TagIcon;
  if (name.includes("uncategorized") || name.includes("unknown"))
    return CircleHelpIcon;
  if (
    name.includes("legal") ||
    name.includes("law") ||
    name.includes("contract")
  )
    return ScaleIcon;
  if (
    name.includes("support") ||
    name.includes("help") ||
    name.includes("customer")
  )
    return HeadphonesIcon;
  if (name.includes("personal") || name.includes("private")) return UserIcon;
  if (
    name.includes("event") ||
    name.includes("calendar") ||
    name.includes("meeting")
  )
    return CalendarIcon;
  if (name.includes("account") || name.includes("profile"))
    return UserCircleIcon;

  // Default icon
  return MailIcon;
}

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

    return grouped;
  }, [emailGroups, categories, categoryMap]);

  // Sort categories alphabetically, but always put Uncategorized last
  const sortedCategoryEntries = useMemo(() => {
    return Object.entries(groupedEmails).sort(([a], [b]) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
  }, [groupedEmails]);

  const [selectedCategoryName, setSelectedCategoryName] =
    useQueryState("categoryName");

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

    for (const sender of selectedToArchive) {
      await addToArchiveSenderQueue({
        sender: sender.address,
        emailAccountId,
      });
    }

    setArchivedCategories((prev) => ({ ...prev, [categoryName]: true }));
  };

  const onEditCategory = (categoryName: string) => {
    setSelectedCategoryName(categoryName);
  };

  const onRemoveAllFromCategory = async (categoryName: string) => {
    const yes = confirm(
      "This will remove all emails from this category. You can re-categorize them later. Do you want to continue?",
    );
    if (!yes) return;
    const result = await removeAllFromCategoryAction(emailAccountId, {
      categoryName,
    });

    if (result?.serverError) {
      toastError({ description: result.serverError });
    } else {
      toastSuccess({
        description: "All emails removed from category",
      });
    }
  };

  return (
    <>
      <div className="space-y-3 p-4">
        {sortedCategoryEntries.map(([categoryName, senders]) => {
          const category = categoryMap[categoryName];
          const CategoryIcon = getCategoryIcon(categoryName);

          // Skip if no category found (but allow Uncategorized)
          if (!category && categoryName !== "Uncategorized") return null;

          const isExpanded = expandedCategory === categoryName;
          const isArchived = archivedCategories[categoryName];

          if (isArchived) {
            return (
              <Card key={categoryName} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-xl opacity-50">
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
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-xl">
                      <CategoryIcon className="size-5" />
                    </div>
                    <div>
                      <h2 className="font-medium">{categoryName}</h2>
                      <p className="text-sm text-muted-foreground">
                        {senders.length} senders
                        {category?.description && ` · ${category.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVerticalIcon className="size-4" />
                          <span className="sr-only">More</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onEditCategory(categoryName)}
                        >
                          <PencilIcon className="mr-2 size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onRemoveAllFromCategory(categoryName)}
                        >
                          <BookmarkXIcon className="mr-2 size-4" />
                          Remove All From Category
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                  <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
                    <p className="text-xs text-muted-foreground">
                      {category?.description || "Senders in this category"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newSelected = { ...selectedSenders };
                          for (const s of senders) {
                            newSelected[s.address] = true;
                          }
                          setSelectedSenders(newSelected);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Select all
                      </button>
                      <span className="text-muted-foreground/50">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newSelected = { ...selectedSenders };
                          for (const s of senders) {
                            newSelected[s.address] = false;
                          }
                          setSelectedSenders(newSelected);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Deselect all
                      </button>
                    </div>
                  </div>
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

      {/* Footer note */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Emails are archived, not deleted. You can find them in Gmail anytime.
      </p>

      <CreateCategoryDialog
        isOpen={selectedCategoryName !== null}
        onOpenChange={(open) =>
          setSelectedCategoryName(open ? selectedCategoryName : null)
        }
        closeModal={() => setSelectedCategoryName(null)}
        category={
          selectedCategoryName
            ? categories.find((c) => c.name === selectedCategoryName)
            : undefined
        }
      />
    </>
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
  onToggleSelection: (e: React.MouseEvent) => void;
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
            onToggleSelection(e as unknown as React.MouseEvent);
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
