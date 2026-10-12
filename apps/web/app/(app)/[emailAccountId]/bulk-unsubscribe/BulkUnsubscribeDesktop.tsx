"use client";

import type React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActionCell,
  HeaderButton,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/common";
import type { RowProps } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { ButtonCheckbox } from "@/components/ButtonCheckbox";
import { SenderIcon } from "@/components/SenderIcon";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils";
import { isUnsubscribeSuggestion } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";

export function BulkUnsubscribeDesktop({
  tableRows,
  sortColumn,
  sortDirection,
  onSort,
  isAllSelected,
  isSomeSelected,
  onToggleSelectAll,
}: {
  tableRows?: React.ReactNode;
  sortColumn: "emails" | "unread" | "unarchived";
  sortDirection: "asc" | "desc";
  onSort: (column: "emails" | "unread" | "unarchived") => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  onToggleSelectAll: () => void;
}) {
  return (
    // Only let the header stick to the page once the widest rows fit (~800px);
    // narrower, e.g. with the chat sidebar open, the table keeps its own
    // horizontal scroll so the actions column isn't clipped.
    <div className="[container-type:inline-size]">
      <Table
        className="bulk-unsub-table min-[641px]:min-w-[800px] sm:table-fixed"
        containerClassName="[@container(min-width:800px)]:overflow-visible"
      >
        <TableHeader
          sticky
          className="[&_th:first-child]:rounded-tl-lg [&_th:last-child]:rounded-tr-lg"
        >
          <TableRow>
            <TableHead className="w-10 pr-0">
              <ButtonCheckbox
                label={
                  isAllSelected ? "Deselect all senders" : "Select all senders"
                }
                checked={isAllSelected}
                indeterminate={isSomeSelected && !isAllSelected}
                onChange={() => onToggleSelectAll()}
              />
            </TableHead>
            <TableHead className="pl-4">
              <span className="text-sm font-medium">From</span>
            </TableHead>
            <TableHead className="w-[90px] whitespace-nowrap">
              <HeaderButton
                sorted={sortColumn === "emails"}
                sortDirection={
                  sortColumn === "emails" ? sortDirection : undefined
                }
                onClick={() => onSort("emails")}
              >
                Emails
              </HeaderButton>
            </TableHead>
            <TableHead className="w-[150px] whitespace-nowrap">
              <HeaderButton
                sorted={sortColumn === "unread"}
                sortDirection={
                  sortColumn === "unread" ? sortDirection : undefined
                }
                onClick={() => onSort("unread")}
              >
                Read
              </HeaderButton>
            </TableHead>
            <TableHead className="w-[300px]" />
          </TableRow>
        </TableHeader>
        <TableBody>{tableRows}</TableBody>
      </Table>
    </div>
  );
}

export function BulkUnsubscribeRowDesktop({
  item,
  refetchPremium,
  selected,
  onSelectRow,
  hasUnsubscribeAccess,
  mutate,
  onOpenNewsletter,
  labels,
  openPremiumModal,
  userEmail,
  emailAccountId,
  onToggleSelect,
  checked,
  filter,
  readPercentage,
}: RowProps) {
  const isSuggested = isUnsubscribeSuggestion(item);

  return (
    <TableRow
      key={item.name}
      className={cn(
        "cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/50",
        checked &&
          "bg-blue-500/[.08] hover:bg-blue-500/[.08] dark:hover:bg-blue-500/[.08]",
      )}
      aria-selected={selected || undefined}
      data-selected={selected || undefined}
      onMouseEnter={onSelectRow}
      onClick={(event) => {
        // Clicks from portaled menus and dialogs bubble through the React tree
        // but are not DOM descendants of the row.
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target)) return;
        if (target.closest("button, a, input, [data-cell=checkbox]")) return;
        if (window.getSelection()?.toString()) return;
        onOpenNewsletter(item);
      }}
    >
      <TableCell className="w-10 pr-0" data-cell="checkbox">
        <ButtonCheckbox
          label={`Select ${item.fromName || item.name}`}
          checked={checked}
          onChange={(shiftKey) => onToggleSelect?.(item.name, shiftKey)}
        />
      </TableCell>
      <TableCell className="min-w-0 py-3 pl-4" data-cell="from">
        <div className="flex items-center gap-2 min-w-0">
          <SenderIcon email={item.name} name={item.fromName} size={32} />
          <div className="min-w-0 lg:flex lg:items-baseline lg:gap-2">
            <div className="truncate font-medium">
              {item.fromName || item.name}
            </div>
            {item.fromName && (
              <div className="truncate text-xs text-muted-foreground lg:text-sm">
                {item.name}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap" data-label="Emails">
        <span className="font-medium text-foreground/80">{item.value}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap" data-label="Read">
        <div className="flex items-center gap-2">
          <Progress
            value={readPercentage}
            className={cn(
              "h-1.5 w-16",
              isSuggested ? "bg-amber-100 dark:bg-amber-950" : "bg-muted",
            )}
            innerClassName={
              isSuggested ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-500"
            }
          />
          <span
            className={cn(
              "font-medium",
              isSuggested
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground/80",
            )}
          >
            {Math.round(readPercentage)}%
          </span>
        </div>
      </TableCell>
      <TableCell className="w-auto sm:w-[300px] p-1" data-cell="actions">
        <div className="flex justify-end items-center gap-1">
          <ActionCell
            item={item}
            hasUnsubscribeAccess={hasUnsubscribeAccess}
            mutate={mutate}
            refetchPremium={refetchPremium}
            onOpenNewsletter={onOpenNewsletter}
            selected={selected}
            labels={labels}
            openPremiumModal={openPremiumModal}
            userEmail={userEmail}
            emailAccountId={emailAccountId}
            filter={filter}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
