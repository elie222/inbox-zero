"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import groupBy from "lodash/groupBy";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  type ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import {
  ArchiveIcon,
  ChevronRight,
  MoreVerticalIcon,
  PencilIcon,
  EyeIcon,
} from "lucide-react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmailCell } from "@/components/EmailCell";
import { useThreads } from "@/hooks/useThreads";
import { Skeleton } from "@/components/ui/skeleton";
import { decodeSnippet } from "@/utils/gmail/decode";
import { formatShortDate } from "@/utils/date";
import { cn } from "@/utils";
import { toastSuccess, toastError } from "@/components/Toast";
import { changeSenderCategoryAction } from "@/utils/actions/categorize";
import { markCategoryAsReadAction } from "@/utils/actions/deep-clean";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  addToArchiveSenderQueue,
  useArchiveSenderStatus,
} from "@/store/archive-sender-queue";
import { getEmailUrl, getGmailSearchUrl } from "@/utils/url";
import { MessageText } from "@/components/Typography";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryWithRules } from "@/utils/category.server";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { useAccount } from "@/providers/EmailAccountProvider";

const COLUMNS = 5;

type EmailGroup = {
  address: string;
  category: CategoryWithRules | null;
  meta?: { width?: string };
};

export function DeepCleanGroupedTable({
  emailGroups,
  categories,
}: {
  emailGroups: EmailGroup[];
  categories: CategoryWithRules[];
}) {
  const { emailAccountId, userEmail } = useAccount();
  const [selectedSenders, setSelectedSenders] = useState<Set<string>>(
    new Set(),
  );

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

  const [expanded, setExpanded] = useQueryState("expanded", {
    parse: (value) => value.split(","),
    serialize: (value) => value.join(","),
  });

  const columns: ColumnDef<EmailGroup>[] = useMemo(
    () => [
      {
        id: "checkbox",
        cell: ({ row }) => (
          <Checkbox
            checked={selectedSenders.has(row.original.address)}
            onCheckedChange={(checked) => {
              const newSelected = new Set(selectedSenders);
              if (checked) {
                newSelected.add(row.original.address);
              } else {
                newSelected.delete(row.original.address);
              }
              setSelectedSenders(newSelected);
            }}
          />
        ),
        meta: { size: "40px" },
      },
      {
        id: "expander",
        cell: ({ row }) => {
          return row.getCanExpand() ? (
            <button
              type="button"
              onClick={row.getToggleExpandedHandler()}
              className="p-2"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transform transition-all duration-300 ease-in-out",
                  row.getIsExpanded() ? "rotate-90" : "rotate-0",
                )}
              />
            </button>
          ) : null;
        },
        meta: { size: "20px" },
      },
      {
        accessorKey: "address",
        cell: ({ row }) => (
          <Link
            href={getGmailSearchUrl(row.original.address, userEmail)}
            target="_blank"
            className="hover:underline"
          >
            <div className="flex items-center justify-between">
              <EmailCell
                emailAddress={row.original.address}
                className="flex gap-2"
              />
            </div>
          </Link>
        ),
      },
      {
        accessorKey: "preview",
        cell: ({ row }) => {
          return <ArchiveStatusCell sender={row.original.address} />;
        },
      },
      {
        accessorKey: "actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs">
                <MoreVerticalIcon className="size-4" />
                <span className="sr-only">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  // TODO: Implement mark as read functionality
                  toastSuccess({ description: "Marked as read" });
                }}
              >
                <EyeIcon className="mr-2 size-4" />
                Mark as Read
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  addToArchiveSenderQueue({
                    sender: row.original.address,
                    emailAccountId,
                  });
                }}
              >
                <ArchiveIcon className="mr-2 size-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PencilIcon className="mr-2 size-4" />
                  Re-categorize
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {categories.map((category) => (
                      <DropdownMenuItem
                        key={category.id}
                        onClick={async () => {
                          const result = await changeSenderCategoryAction(
                            emailAccountId,
                            {
                              sender: row.original.address,
                              categoryId: category.id,
                            },
                          );

                          if (result?.serverError) {
                            toastError({ description: result.serverError });
                          } else {
                            toastSuccess({ description: "Category changed" });
                            // Refresh the page to show updated categories
                            window.location.reload();
                          }
                        }}
                      >
                        {category.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        meta: { size: "60px" },
      },
    ],
    [categories, userEmail, emailAccountId, selectedSenders],
  );

  const table = useReactTable({
    data: emailGroups,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  // Select all senders in a category
  const selectAllInCategory = (senders: EmailGroup[]) => {
    const newSelected = new Set(selectedSenders);
    senders.forEach((sender) => newSelected.add(sender.address));
    setSelectedSenders(newSelected);
  };

  // Deselect all senders in a category
  const deselectAllInCategory = (senders: EmailGroup[]) => {
    const newSelected = new Set(selectedSenders);
    senders.forEach((sender) => newSelected.delete(sender.address));
    setSelectedSenders(newSelected);
  };

  // Archive selected senders
  const archiveSelected = async () => {
    for (const sender of selectedSenders) {
      await addToArchiveSenderQueue({
        sender,
        emailAccountId,
      });
    }
    setSelectedSenders(new Set());
  };

  // Mark selected as read
  const markSelectedAsRead = async () => {
    // TODO: Implement mark as read functionality
    toastSuccess({
      description: `Marked ${selectedSenders.size} senders as read`,
    });
    setSelectedSenders(new Set());
  };

  return (
    <>
      {/* Bulk Actions */}
      {selectedSenders.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">
            {selectedSenders.size} sender{selectedSenders.size !== 1 ? "s" : ""}{" "}
            selected
          </span>
          <Button size="sm" variant="outline" onClick={markSelectedAsRead}>
            <EyeIcon className="mr-2 size-4" />
            Mark as Read
          </Button>
          <Button size="sm" variant="destructive" onClick={archiveSelected}>
            <ArchiveIcon className="mr-2 size-4" />
            Archive Selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedSenders(new Set())}
          >
            Clear Selection
          </Button>
        </div>
      )}

      <Table>
        <TableBody>
          {Object.entries(groupedEmails).map(([categoryName, senders]) => {
            const isCategoryExpanded = expanded?.includes(categoryName);
            const categorySelectedCount = senders.filter((sender) =>
              selectedSenders.has(sender.address),
            ).length;
            const isAllSelected =
              senders.length > 0 && categorySelectedCount === senders.length;
            const isPartiallySelected =
              categorySelectedCount > 0 &&
              categorySelectedCount < senders.length;

            const onArchiveAll = async () => {
              for (const sender of senders) {
                await addToArchiveSenderQueue({
                  sender: sender.address,
                  emailAccountId,
                });
              }
            };

            const onMarkAllAsRead = async () => {
              try {
                const result = await markCategoryAsReadAction(emailAccountId, {
                  category: categoryName,
                });

                if (result?.serverError) {
                  toastError({ description: result.serverError });
                } else {
                  toastSuccess({
                    description:
                      result?.data?.message ||
                      `Marked all ${senders.length} senders as read`,
                  });
                }
              } catch (error) {
                toastError({ description: "Failed to mark emails as read" });
                console.error("Mark as read error:", error);
              }
            };

            // const onEditCategory = () => {
            //   setSelectedCategoryName(categoryName);
            // };

            // const onRemoveAllFromCategory = async () => {
            //   const yes = confirm(
            //     "This will remove all emails from this category. You can re-categorize them later. Do you want to continue?",
            //   );
            //   if (!yes) return;
            //   const result = await removeAllFromCategoryAction(emailAccountId, {
            //     categoryName,
            //   });

            //   if (result?.serverError) {
            //     toastError({ description: result.serverError });
            //   } else {
            //     toastSuccess({
            //       description: "All emails removed from category",
            //     });
            //   }
            // };

            const category = categoryMap[categoryName];

            if (!category) {
              return null;
            }

            return (
              <Fragment key={categoryName}>
                <GroupRow
                  category={category}
                  count={senders.length}
                  isExpanded={!!isCategoryExpanded}
                  isAllSelected={isAllSelected}
                  isPartiallySelected={isPartiallySelected}
                  onToggle={() => {
                    setExpanded((prev) =>
                      isCategoryExpanded
                        ? (prev || []).filter((c) => c !== categoryName)
                        : [...(prev || []), categoryName],
                    );
                  }}
                  onSelectAll={() => selectAllInCategory(senders)}
                  onDeselectAll={() => deselectAllInCategory(senders)}
                  onArchiveAll={onArchiveAll}
                  onMarkAllAsRead={onMarkAllAsRead}
                />
                {isCategoryExpanded && (
                  <SenderRows
                    table={table}
                    senders={senders}
                    userEmail={userEmail}
                  />
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      {/* <CreateCategoryDialog
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
      /> */}
    </>
  );
}

function GroupRow({
  category,
  count,
  isExpanded,
  isAllSelected,
  isPartiallySelected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onArchiveAll,
  onMarkAllAsRead,
}: {
  category: CategoryWithRules;
  count: number;
  isExpanded: boolean;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  onToggle: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onArchiveAll: () => void;
  onMarkAllAsRead: () => void;
}) {
  return (
    <TableRow className="h-8 cursor-pointer bg-muted/50">
      <TableCell
        className="py-1"
        onClick={(e) => {
          e.stopPropagation();
          if (isAllSelected) {
            onDeselectAll();
          } else {
            onSelectAll();
          }
        }}
      >
        <Checkbox
          checked={isAllSelected}
          ref={(el) => {
            if (el && "indeterminate" in el) {
              // biome-ignore lint/suspicious/noExplicitAny: indeterminate is a valid property on checkbox elements
              (el as any).indeterminate = isPartiallySelected;
            }
          }}
        />
      </TableCell>
      <TableCell
        colSpan={2}
        className="py-1 text-sm font-medium text-foreground"
        onClick={onToggle}
      >
        <div className="flex items-center">
          <ChevronRight
            className={cn(
              "mr-2 size-4 transform transition-all duration-300 ease-in-out",
              isExpanded ? "rotate-90" : "rotate-0",
            )}
          />
          {category.name}
          <span className="ml-2 text-xs text-muted-foreground">({count})</span>
        </div>
      </TableCell>
      <TableCell className="py-1" />
      <TableCell className="flex justify-end gap-1.5 py-1">
        {/* <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs">
              <MoreVerticalIcon className="size-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEditCategory}>
              <PencilIcon className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRemoveAllFromCategory}>
              <BookmarkXIcon className="mr-2 size-4" />
              Remove All From Category
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> */}

        <Button variant="outline" size="xs" onClick={onMarkAllAsRead}>
          <EyeIcon className="mr-2 size-4" />
          Mark as Read
        </Button>
        <Button variant="outline" size="xs" onClick={onArchiveAll}>
          <ArchiveIcon className="mr-2 size-4" />
          Archive all
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SenderRows({
  table,
  senders,
  userEmail,
}: {
  table: ReturnType<typeof useReactTable<EmailGroup>>;
  senders: EmailGroup[];
  userEmail: string;
}) {
  if (!senders.length) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>
          <MessageText>This category is empty</MessageText>
        </TableCell>
      </TableRow>
    );
  }

  return senders.map((sender) => {
    const row = table
      .getRowModel()
      .rows.find((r) => r.original.address === sender.address);
    if (!row) return null;
    return (
      <Fragment key={row.id}>
        <TableRow>
          {row.getVisibleCells().map((cell) => (
            <TableCell
              key={cell.id}
              style={{
                width:
                  (cell.column.columnDef.meta as { size?: string })?.size ||
                  "auto",
              }}
              className="py-1"
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
        {row.getIsExpanded() && (
          <ExpandedRows sender={row.original.address} userEmail={userEmail} />
        )}
      </Fragment>
    );
  });
}

function ExpandedRows({
  sender,
  userEmail,
}: {
  sender: string;
  userEmail: string;
}) {
  const { provider } = useAccount();

  // Only show emails that are currently in inbox (not archived)
  // This prevents showing emails from 6 months ago that are no longer relevant
  const { data, isLoading, error } = useThreads({
    fromEmail: sender,
    limit: 5,
    type: "inbox", // Only show inbox emails, not archived ones
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>
          <Skeleton className="h-10 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>Error loading emails</TableCell>
      </TableRow>
    );
  }

  if (!data?.threads.length) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>No emails found</TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data.threads.map((thread) => {
        const firstMessage = thread.messages[0];
        const subject = firstMessage.subject;
        const date = firstMessage.date;

        return (
          <TableRow key={thread.id} className="bg-muted/50">
            <TableCell className="py-3">
              <ViewEmailButton threadId={thread.id} messageId={thread.id} />
            </TableCell>
            <TableCell className="py-3">
              <Link
                href={getEmailUrl(thread.id, userEmail, provider)}
                target="_blank"
                className="hover:underline"
              >
                {subject}
              </Link>
            </TableCell>
            <TableCell className="py-3">
              {decodeSnippet(thread.messages[0].snippet)}
            </TableCell>
            <TableCell className="text-nowrap py-3">
              {formatShortDate(new Date(date))}
            </TableCell>
            <TableCell className="py-3" />
          </TableRow>
        );
      })}
    </>
  );
}

function ArchiveStatusCell({ sender }: { sender: string }) {
  const status = useArchiveSenderStatus(sender);

  switch (status?.status) {
    case "completed":
      if (status.threadsTotal) {
        return (
          <span className="text-green-500">
            Archived {status.threadsTotal} emails!
          </span>
        );
      }
      return <span className="text-muted-foreground">Archived</span>;
    case "processing":
      return (
        <span className="text-blue-500">
          Archiving... {status.threadsTotal - status.threadIds.length} /{" "}
          {status.threadsTotal}
        </span>
      );
    case "pending":
      return <span className="text-muted-foreground">Pending...</span>;
    default:
      return null;
  }
}
