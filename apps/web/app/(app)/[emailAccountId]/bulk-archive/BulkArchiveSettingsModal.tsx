"use client";

import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  ArchiveIcon,
  MailOpenIcon,
  SettingsIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BulkActionType = "archive" | "markRead" | "delete";

interface BulkArchiveSettingsModalProps {
  onActionChange: (action: BulkActionType) => void;
  selectedAction: BulkActionType;
}

export function BulkArchiveSettingsModal({
  selectedAction,
  onActionChange,
}: BulkArchiveSettingsModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SettingsIcon className="mr-2 size-4" />
          <Trans>Settings</Trans>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Bulk Archive Settings</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-8">
            <div className="space-y-2">
              <p className="font-medium">
                <Trans>Action</Trans>
              </p>
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Choose what happens when you click the action buttons on each
                  category
                </Trans>
              </p>
            </div>
            <Select
              value={selectedAction}
              onValueChange={(value) => onActionChange(value as BulkActionType)}
            >
              <SelectTrigger className="w-[180px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="archive">
                  <div className="flex items-center gap-2">
                    <ArchiveIcon className="size-4" />
                    <span>
                      <Trans>Archive</Trans>
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="markRead">
                  <div className="flex items-center gap-2">
                    <MailOpenIcon className="size-4" />
                    <span>
                      <Trans>Mark as read</Trans>
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="delete">
                  <div className="flex items-center gap-2">
                    <TrashIcon className="size-4" />
                    <span>
                      <Trans>Delete</Trans>
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getActionLabels(action: BulkActionType, i18n: I18n) {
  if (action === "delete") {
    return {
      buttonLabel: t(i18n)`Delete`,
      allLabel: t(i18n)`Delete all`,
      countLabel: (selected: number, total: number) =>
        t(i18n)`Delete ${selected} of ${total}`,
      completedLabel: t(i18n)`Deleted`,
      icon: TrashIcon,
    };
  }

  if (action === "markRead") {
    return {
      buttonLabel: t(i18n)`Mark as read`,
      allLabel: t(i18n)`Mark all as read`,
      countLabel: (selected: number, total: number) =>
        t(i18n)`Mark ${selected} of ${total} as read`,
      completedLabel: t(i18n)`Marked as read`,
      icon: MailOpenIcon,
    };
  }
  return {
    buttonLabel: t(i18n)`Archive`,
    allLabel: t(i18n)`Archive all`,
    countLabel: (selected: number, total: number) =>
      t(i18n)`Archive ${selected} of ${total}`,
    completedLabel: t(i18n)`Archived`,
    icon: ArchiveIcon,
  };
}
