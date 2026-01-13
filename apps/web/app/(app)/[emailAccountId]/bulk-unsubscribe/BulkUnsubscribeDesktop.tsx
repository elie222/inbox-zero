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
import { Checkbox } from "@/components/Checkbox";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { extractDomainFromEmail } from "@/utils/email";

export function BulkUnsubscribeDesktop({
  tableRows,
  sortColumn,
  sortDirection,
  onSort,
  isAllSelected,
  onToggleSelectAll,
}: {
  tableRows?: React.ReactNode;
  sortColumn: "emails" | "unread" | "unarchived";
  sortDirection: "asc" | "desc";
  onSort: (column: "emails" | "unread" | "unarchived") => void;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pr-0">
            <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
          </TableHead>
          <TableHead>
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
      <TableCell className="pr-0">
        <Checkbox
          checked={checked}
          onChange={() => onToggleSelect?.(item.name)}
        />
      </TableCell>
      <TableCell className="max-w-[250px] truncate py-3">
        <div className="flex items-center gap-2">
          <DomainIcon domain={domain} size={32} />
          <div className="flex flex-col">
            <span className="font-medium">{item.fromName || item.name}</span>
            {item.fromName && (
              <span className="text-xs text-muted-foreground">{item.name}</span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">{item.value}</span>
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
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
