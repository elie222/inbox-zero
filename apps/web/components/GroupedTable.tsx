"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
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
  FileCogIcon,
  PlusIcon,
  BookmarkXIcon,
} from "lucide-react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ConditionType } from "@/utils/config";
import { EmailCell } from "@/components/EmailCell";
import { useThreads } from "@/hooks/useThreads";
import { Skeleton } from "@/components/ui/skeleton";
import { decodeSnippet } from "@/utils/gmail/decode";
import { formatShortDate } from "@/utils/date";
import { cn } from "@/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeSenderCategoryAction,
  removeAllFromCategoryAction,
} from "@/utils/actions/categorize";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  addToArchiveSenderQueue,
  useArchiveSenderStatus,
} from "@/store/archive-sender-queue";
import { getGmailSearchUrl, getGmailUrl } from "@/utils/url";
import { MessageText } from "@/components/Typography";
import { CreateCategoryDialog } from "@/app/(app)/[emailAccountId]/smart-categories/CreateCategoryButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryWithRules } from "@/utils/category.server";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { CategorySelect } from "@/components/CategorySelect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

const COLUMNS = 4;

type EmailGroup = {
  address: string;
  category: CategoryWithRules | null;
  meta?: { width?: string };
};

export function GroupedTable({
  emailGroups,
  categories,
}: {
  emailGroups: EmailGroup[];
  categories: CategoryWithRules[];
}) {
  const { emailAccountId, userEmail } = useAccount();

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
        accessorKey: "date",
        cell: ({ row }) => (
          <Select
            defaultValue={row.original.category?.id || ""}
            onValueChange={async (value) => {
              const result = await changeSenderCategoryAction(emailAccountId, {
                sender: row.original.address,
                categoryId: value,
              });

              if (result?.serverError) {
                toastError({ description: result.serverError });
              } else {
                toastSuccess({ description: "Category changed" });
              }
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id.toString()}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
    ],
    [categories, userEmail, emailAccountId],
  );

  const table = useReactTable({
    data: emailGroups,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const [selectedCategoryName, setSelectedCategoryName] =
    useQueryState("categoryName");

  return (
    <>
      <Table>
        <TableBody>
          {Object.entries(groupedEmails).map(([categoryName, senders]) => {
            const isCategoryExpanded = expanded?.includes(categoryName);

            const onArchiveAll = async () => {
              for (const sender of senders) {
                await addToArchiveSenderQueue({
                  sender: sender.address,
                  emailAccountId,
                });
              }
            };

            const onEditCategory = () => {
              setSelectedCategoryName(categoryName);
            };

            const onRemoveAllFromCategory = async () => {
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

            const category = categoryMap[categoryName];

            if (!category) {
              return null;
            }

            return (
              <Fragment key={categoryName}>
                <GroupRow
                  emailAccountId={emailAccountId}
                  category={category}
                  count={senders.length}
                  isExpanded={!!isCategoryExpanded}
                  onToggle={() => {
                    setExpanded((prev) =>
                      isCategoryExpanded
                        ? (prev || []).filter((c) => c !== categoryName)
                        : [...(prev || []), categoryName],
                    );
                  }}
                  onArchiveAll={onArchiveAll}
                  onEditCategory={onEditCategory}
                  onRemoveAllFromCategory={onRemoveAllFromCategory}
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

export function SendersTable({
  senders,
  categories,
}: {
  senders: EmailGroup[];
  categories: CategoryWithRules[];
}) {
  const { emailAccountId, userEmail } = useAccount();

  const columns: ColumnDef<EmailGroup>[] = useMemo(
    () => [
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
          <div className="flex items-center justify-between">
            <EmailCell
              emailAddress={row.original.address}
              className="flex gap-2"
            />
          </div>
        ),
      },
      {
        accessorKey: "preview",
      },
      {
        accessorKey: "category",
        cell: ({ row }) => {
          return (
            <CategorySelect
              emailAccountId={emailAccountId}
              sender={row.original.address}
              senderCategory={row.original.category}
              categories={categories}
            />
          );
        },
      },
    ],
    [categories, emailAccountId],
  );

  const table = useReactTable({
    data: senders,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <Table>
      <TableBody>
        <SenderRows table={table} senders={senders} userEmail={userEmail} />
      </TableBody>
    </Table>
  );
}

function GroupRow({
  emailAccountId,
  category,
  count,
  isExpanded,
  onToggle,
  onArchiveAll,
  onEditCategory,
  onRemoveAllFromCategory,
}: {
  emailAccountId: string;
  category: CategoryWithRules;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  onArchiveAll: () => void;
  onEditCategory: () => void;
  onRemoveAllFromCategory: () => void;
}) {
  return (
    <TableRow className="h-8 cursor-pointer bg-muted/50">
      <TableCell
        colSpan={3}
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
      <TableCell className="flex justify-end gap-1.5 py-1">
        <DropdownMenu>
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
        </DropdownMenu>

        {category.rules.length ? (
          <div className="flex items-center gap-1">
            {category.rules.map((rule) => (
              <Button variant="outline" size="xs" asChild key={rule.id}>
                <Link
                  href={prefixPath(
                    emailAccountId,
                    `/automation?tab=rule&ruleId=${rule.id}`,
                  )}
                  target="_blank"
                >
                  <FileCogIcon className="mr-1 size-4" />
                  <span>{rule.name || `Rule ${rule.id}`}</span>
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <Button variant="outline" size="xs" asChild>
            <Link
              href={prefixPath(
                emailAccountId,
                `/assistant/rule/create?type=${ConditionType.CATEGORY}&categoryId=${category.id}&label=${category.name}`,
              )}
              target="_blank"
            >
              <PlusIcon className="mr-2 size-4" />
              Attach rule
            </Link>
          </Button>
        )}
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
                width: (cell.column.columnDef.meta as any)?.size || "auto",
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
  const { data, isLoading, error } = useThreads({
    fromEmail: sender,
    limit: 5,
    type: "all",
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
      {data.threads.map((thread) => (
        <TableRow key={thread.id} className="bg-muted/50">
          <TableCell className="py-3">
            <ViewEmailButton threadId={thread.id} messageId={thread.id} />
          </TableCell>
          <TableCell className="py-3">
            <Link
              href={getGmailUrl(thread.id, userEmail)}
              target="_blank"
              className="hover:underline"
            >
              {thread.messages[0].headers.subject}
            </Link>
          </TableCell>
          <TableCell className="py-3">
            {decodeSnippet(thread.messages[0].snippet)}
          </TableCell>
          <TableCell className="text-nowrap py-3">
            {formatShortDate(new Date(thread.messages[0].headers.date))}
          </TableCell>
        </TableRow>
      ))}
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
