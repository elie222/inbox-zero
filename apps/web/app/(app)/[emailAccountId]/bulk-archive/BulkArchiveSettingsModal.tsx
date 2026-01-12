"use client";

import { ArchiveIcon, MailOpenIcon, SettingsIcon } from "lucide-react";
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

export type BulkActionType = "archive" | "markRead";

interface BulkArchiveSettingsModalProps {
  selectedAction: BulkActionType;
  onActionChange: (action: BulkActionType) => void;
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
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Bulk Archive Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-8">
            <div className="space-y-2">
              <p className="font-medium">Action</p>
              <p className="text-sm text-muted-foreground">
                Choose what happens when you click the action buttons on each
                category
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
                    <span>Archive</span>
                  </div>
                </SelectItem>
                <SelectItem value="markRead">
                  <div className="flex items-center gap-2">
                    <MailOpenIcon className="size-4" />
                    <span>Mark as read</span>
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

export function getActionLabels(action: BulkActionType) {
  if (action === "markRead") {
    return {
      buttonLabel: "Mark as read",
      allLabel: "Mark all as read",
      countLabel: (selected: number, total: number) =>
        `Mark ${selected} of ${total} as read`,
      completedLabel: "Marked as read",
      icon: MailOpenIcon,
    };
  }
  return {
    buttonLabel: "Archive",
    allLabel: "Archive all",
    countLabel: (selected: number, total: number) =>
      `Archive ${selected} of ${total}`,
    completedLabel: "Archived",
    icon: ArchiveIcon,
  };
}
