"use client";

import React, { Fragment } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Category } from "@prisma/client";
import { EmailCell } from "@/components/EmailCell";
import { useThreads } from "@/hooks/useThreads";
import { Skeleton } from "@/components/ui/skeleton";
import { decodeSnippet } from "@/utils/gmail/decode";
import { formatShortDate } from "@/utils/date";
import { cn } from "@/utils";

type EmailGroup = {
  address: string;
  category: Pick<Category, "id" | "name"> | null;
  meta?: {
    width?: string;
  };
};

const columns: ColumnDef<EmailGroup>[] = [
  {
    id: "expander",
    header: () => null,
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
    header: "Email Address",
    cell: ({ row }) => (
      <div className="flex items-center justify-between">
        <EmailCell emailAddress={row.original.address} className="flex gap-2" />
        {row.original.category && (
          <Badge variant="outline">{row.original.category.name}</Badge>
        )}
      </div>
    ),
  },
  {
    header: "Preview",
  },
  {
    header: "Date",
  },
];

export function GroupedTable({ emailGroups }: { emailGroups: EmailGroup[] }) {
  const table = useReactTable({
    data: emailGroups,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                style={{
                  width: (header.column.columnDef.meta as any)?.size || "auto",
                }}
              >
                {!header.isPlaceholder
                  ? flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
                  : null}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
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
            {row.getIsExpanded() && (
              <ExpandedRows sender={row.original.address} />
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
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
        <TableCell colSpan={columns.length}>
          <Skeleton className="h-10 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={columns.length}>Error loading emails</TableCell>
      </TableRow>
    );
  }

  if (!data?.threads.length) {
    return (
      <TableRow>
        <TableCell colSpan={columns.length}>No emails found</TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data.threads.map((thread) => (
        <TableRow className="bg-muted/50">
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
