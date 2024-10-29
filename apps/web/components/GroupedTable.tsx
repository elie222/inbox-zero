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
import { ArchiveIcon, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { Category } from "@prisma/client";
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
import { changeSenderCategoryAction } from "@/utils/actions/categorize";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";
import { useAiCategorizationQueueItem } from "@/store/ai-categorize-sender-queue";
import { LoadingMiniSpinner } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import {
  addToArchiveSenderQueue,
  useArchiveSenderStatus,
} from "@/store/archive-sender-queue";
import { getGmailSearchUrl, getGmailUrl } from "@/utils/url";

type EmailGroup = {
  address: string;
  category: Pick<Category, "id" | "name"> | null;
  meta?: {
    width?: string;
  };
};

export function GroupedTable({
  emailGroups,
  categories,
}: {
  emailGroups: EmailGroup[];
  categories: Pick<Category, "id" | "name">[];
}) {
  const groupedEmails = useMemo(() => {
    const grouped = groupBy(
      emailGroups,
      (group) => group.category?.name || "Uncategorized",
    );

    // Add empty arrays for categories without any emails
    categories.forEach((category) => {
      if (!grouped[category.name]) {
        grouped[category.name] = [];
      }
    });

    return grouped;
  }, [emailGroups, categories]);

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
            <button onClick={row.getToggleExpandedHandler()} className="p-2">
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
            href={getGmailSearchUrl(row.original.address)}
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
            defaultValue={row.original.category?.id.toString() || ""}
            onValueChange={async (value) => {
              const result = await changeSenderCategoryAction({
                sender: row.original.address,
                categoryId: value,
              });

              if (isActionError(result)) {
                toastError({ description: result.error });
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
    [categories],
  );

  const table = useReactTable({
    data: emailGroups,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <Table>
      <TableBody>
        {Object.entries(groupedEmails).map(([category, senders]) => {
          const isCategoryExpanded = expanded?.includes(category);

          const onArchiveAll = async () => {
            for (const sender of senders) {
              await addToArchiveSenderQueue(sender.address);
            }
          };

          return (
            <Fragment key={category}>
              <GroupRow
                category={category}
                count={senders.length}
                isExpanded={!!isCategoryExpanded}
                onToggle={() => {
                  setExpanded((prev) =>
                    isCategoryExpanded
                      ? (prev || []).filter((c) => c !== category)
                      : [...(prev || []), category],
                  );
                }}
                onArchiveAll={onArchiveAll}
              />
              {isCategoryExpanded && (
                <SenderRows table={table} senders={senders} />
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function SendersTable({
  senders,
  categories,
}: {
  senders: EmailGroup[];
  categories: Pick<Category, "id" | "name">[];
}) {
  const columns: ColumnDef<EmailGroup>[] = useMemo(
    () => [
      {
        id: "expander",
        cell: ({ row }) => {
          return row.getCanExpand() ? (
            <button onClick={row.getToggleExpandedHandler()} className="p-2">
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
            <SelectCategoryCell
              sender={row.original.address}
              senderCategory={row.original.category}
              categories={categories}
            />
          );
        },
      },
    ],
    [categories],
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
        <SenderRows table={table} senders={senders} />
      </TableBody>
    </Table>
  );
}

function GroupRow({
  category,
  count,
  isExpanded,
  onToggle,
  onArchiveAll,
}: {
  category: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  onArchiveAll: () => void;
}) {
  return (
    <TableRow className="h-8 cursor-pointer bg-gray-50">
      <TableCell
        colSpan={3}
        className="py-1 text-sm font-medium text-gray-700"
        onClick={onToggle}
      >
        <div className="flex items-center">
          <ChevronRight
            className={cn(
              "mr-2 size-4 transform transition-all duration-300 ease-in-out",
              isExpanded ? "rotate-90" : "rotate-0",
            )}
          />
          {category}
          <span className="ml-2 text-xs text-gray-500">({count})</span>
        </div>
      </TableCell>
      <TableCell className="flex justify-end py-1">
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
}: {
  table: ReturnType<typeof useReactTable<EmailGroup>>;
  senders: EmailGroup[];
}) {
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
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
        {row.getIsExpanded() && <ExpandedRows sender={row.original.address} />}
      </Fragment>
    );
  });
}

function ExpandedRows({ sender }: { sender: string }) {
  const { data, isLoading, error } = useThreads({
    fromEmail: sender,
    limit: 5,
    type: "all",
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <Skeleton className="h-10 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={4}>Error loading emails</TableCell>
      </TableRow>
    );
  }

  if (!data?.threads.length) {
    return (
      <TableRow>
        <TableCell colSpan={4}>No emails found</TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data.threads.map((thread) => (
        <TableRow key={thread.id} className="bg-muted/50">
          <TableCell />
          <TableCell>
            <Link
              href={getGmailUrl(thread.id, sender)}
              target="_blank"
              className="hover:underline"
            >
              {thread.messages[0].headers.subject}
            </Link>
          </TableCell>
          <TableCell>{decodeSnippet(thread.messages[0].snippet)}</TableCell>
          <TableCell className="text-nowrap">
            {formatShortDate(new Date(thread.messages[0].headers.date))}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function SelectCategoryCell({
  sender,
  senderCategory,
  categories,
}: {
  sender: string;
  senderCategory: Pick<Category, "id" | "name"> | null;
  categories: Pick<Category, "id" | "name">[];
}) {
  const item = useAiCategorizationQueueItem(sender);

  if (item?.status && item?.status !== "completed") {
    return (
      <span className="flex items-center text-muted-foreground">
        <LoadingMiniSpinner />
        <span className="ml-2">Categorizing...</span>
      </span>
    );
  }

  return (
    <Select
      defaultValue={item?.categoryId || senderCategory?.id.toString() || ""}
      onValueChange={async (value) => {
        const result = await changeSenderCategoryAction({
          sender,
          categoryId: value,
        });

        if (isActionError(result)) {
          toastError({ description: result.error });
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
      } else {
        return <span className="text-gray-500">Archived</span>;
      }
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
