"use client";

import type React from "react";
import { ProgressBar } from "@tremor/react";
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

export function BulkUnsubscribeDesktop({
  tableRows,
  sortColumn,
  setSortColumn,
  isAllSelected,
  onToggleSelectAll,
}: {
  tableRows?: React.ReactNode;
  sortColumn: "emails" | "unread" | "unarchived";
  setSortColumn: (sortColumn: "emails" | "unread" | "unarchived") => void;
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
              onClick={() => setSortColumn("emails")}
            >
              Emails
            </HeaderButton>
          </TableHead>
          <TableHead>
            <HeaderButton
              sorted={sortColumn === "unread"}
              onClick={() => setSortColumn("unread")}
            >
              Read
            </HeaderButton>
          </TableHead>
          <TableHead>
            <HeaderButton
              sorted={sortColumn === "unarchived"}
              onClick={() => setSortColumn("unarchived")}
            >
              Archived
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
  readPercentage,
  archivedEmails,
  archivedPercentage,
}: RowProps) {
  return (
    <TableRow
      key={item.name}
      className={selected ? "bg-blue-50 dark:bg-muted/50" : undefined}
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
      <TableCell className="max-w-[250px] truncate min-[1550px]:max-w-[300px] min-[1650px]:max-w-[400px] py-3">
        <div className="flex flex-col">
          <span className="font-medium">{item.fromName || item.name}</span>
          {item.fromName && (
            <span className="text-xs text-muted-foreground">{item.name}</span>
          )}
        </div>
      </TableCell>
      <TableCell>{item.value}</TableCell>
      <TableCell>
        <div className="hidden xl:block">
          <ProgressBar
            label={`${Math.round(readPercentage)}%`}
            value={readPercentage}
            tooltip={`${item.readEmails} read. ${
              item.value - item.readEmails
            } unread.`}
            color="blue"
            className="w-[150px]"
          />
        </div>
        <div className="xl:hidden">{Math.round(readPercentage)}%</div>
      </TableCell>
      <TableCell>
        <div className="hidden 2xl:block">
          <ProgressBar
            label={`${Math.round(archivedPercentage)}%`}
            value={archivedPercentage}
            tooltip={`${archivedEmails} archived. ${item.inboxEmails} unarchived.`}
            color="blue"
            className="w-[150px]"
          />
        </div>
        <div className="2xl:hidden">{Math.round(archivedPercentage)}%</div>
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
