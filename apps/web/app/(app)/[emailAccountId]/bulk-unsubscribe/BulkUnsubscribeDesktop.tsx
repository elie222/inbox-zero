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
import { DomainIcon } from "@/components/charts/DomainIcon";
import { extractDomainFromEmail } from "@/utils/email";

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
    <Table className="bulk-unsub-table">
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 pr-0">
            <ButtonCheckbox
              checked={isAllSelected}
              indeterminate={isSomeSelected && !isAllSelected}
              onChange={() => onToggleSelectAll()}
            />
          </TableHead>
          <TableHead className="pl-8">
            <span className="text-sm font-medium">From</span>
          </TableHead>
          <TableHead className="whitespace-nowrap">
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
          <TableHead className="whitespace-nowrap">
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
          <TableHead className="w-[196px]" />
        </TableRow>
      </TableHeader>
      <TableBody>{tableRows}</TableBody>
    </Table>
  );
}

export function BulkUnsubscribeRowDesktop({
  item,
  refetchPremium,
  selected,
  onSelectRow,
  onDoubleClick,
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
  const domain = extractDomainFromEmail(item.name) || item.name;

  return (
    <TableRow
      key={item.name}
      className="hover:bg-transparent dark:hover:bg-transparent"
      aria-selected={selected || undefined}
      data-selected={selected || undefined}
      onMouseEnter={onSelectRow}
      onDoubleClick={onDoubleClick}
    >
      <TableCell className="w-10 pr-0" data-cell="checkbox">
        <ButtonCheckbox
          checked={checked}
          onChange={(shiftKey) => onToggleSelect?.(item.name, shiftKey)}
        />
      </TableCell>
      <TableCell
        className="max-w-[200px] min-w-0 py-3 pl-8 lg:max-w-[350px]"
        data-cell="from"
      >
        <div className="flex items-center gap-2 min-w-0">
          <DomainIcon domain={domain} size={32} variant="circular" />
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
        <span className="font-medium text-foreground/80">
          {Math.round(readPercentage)}%
        </span>
      </TableCell>
      <TableCell className="w-auto sm:w-[196px] p-1" data-cell="actions">
        <div className="flex justify-end items-center gap-2">
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
