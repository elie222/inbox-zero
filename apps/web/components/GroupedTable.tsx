"use client";

import React, { Fragment, useMemo } from "react";
import { useQueryState } from "nuqs";
import groupBy from "lodash/groupBy";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Category } from "@prisma/client";
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
  const groupedEmails = groupBy(emailGroups, (group) => group.category?.name);

  const [collapsed, setCollapsed] = useQueryState("collapsed", {
    parse: (value) => value.split(","),
    serialize: (value) => value.join(","),
  });

  const columns: ColumnDef<EmailGroup>[] = useMemo(
    () => [
      {
        id: "expander",
        // header: () => null,
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
        // header: "Email Address",
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
        // header: "Preview",
      },
      {
        accessorKey: "date",
        // header: "Date",
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
          const isCategoryCollapsed = collapsed?.includes(category);

          return (
            <Fragment key={category}>
              <GroupRow
                category={category}
                count={senders.length}
                isCollapsed={!!isCategoryCollapsed}
                onToggle={() => {
                  setCollapsed((prev) =>
                    isCategoryCollapsed
                      ? (prev || []).filter((c) => c !== category)
                      : [...(prev || []), category],
                  );
                }}
              />
              {!isCategoryCollapsed &&
                senders.map((sender) => {
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
                                (cell.column.columnDef.meta as any)?.size ||
                                "auto",
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      {row.getIsExpanded() && (
                        <ExpandedRows sender={row.original.address} />
                      )}
                    </Fragment>
                  );
                })}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function GroupRow({
  category,
  count,
  isCollapsed,
  onToggle,
}: {
  category: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow className="h-8 cursor-pointer bg-gray-50" onClick={onToggle}>
      <TableCell colSpan={4} className="py-1 text-sm font-medium text-gray-700">
        <div className="flex items-center">
          <ChevronRight
            className={cn(
              "mr-2 h-4 w-4 transform transition-all duration-300 ease-in-out",
              isCollapsed ? "rotate-0" : "rotate-90",
            )}
          />
          {category}
          <span className="ml-2 text-xs text-gray-500">({count})</span>
        </div>
      </TableCell>
    </TableRow>
  );
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
          <TableCell>{thread.messages[0].headers.subject}</TableCell>
          <TableCell>{decodeSnippet(thread.messages[0].snippet)}</TableCell>
          <TableCell className="text-nowrap">
            {formatShortDate(new Date(thread.messages[0].headers.date))}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
