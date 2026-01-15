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
    <Table>
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
          <TableHead>
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
          <TableHead>
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
          <TableHead />
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
      <TableCell className="w-10 pr-0">
        <ButtonCheckbox
          checked={checked}
          onChange={(shiftKey) => onToggleSelect?.(item.name, shiftKey)}
        />
      </TableCell>
      <TableCell className="max-w-[250px] py-3 pl-8">
        <div className="flex items-center gap-2">
          <DomainIcon domain={domain} size={32} />
          <div className="flex flex-col min-w-0">
            <span className="font-medium truncate">
              {item.fromName || item.name}
            </span>
            {item.fromName && (
              <span className="text-xs text-muted-foreground truncate">
                {item.name}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">{item.value}</span>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">
          {Math.round(readPercentage)}%
        </span>
      </TableCell>
      <TableCell className="p-1">
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
