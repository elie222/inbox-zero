"use client";

import { useState } from "react";
import useSWR from "swr";
import { TrashIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import type { LabelCleanupsResponse } from "@/app/api/user/label-cleanup/route";
import { LabelCleanupAction } from "@/generated/prisma/enums";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  deleteLabelCleanupAction,
  saveLabelCleanupAction,
} from "@/utils/actions/label-cleanup";
import { getActionErrorMessage } from "@/utils/error";
import { formatShortDate } from "@/utils/date";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { LabelCombobox } from "@/components/LabelCombobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MutedText } from "@/components/Typography";
import { toastError, toastSuccess } from "@/components/Toast";

const ACTION_LABELS: Record<LabelCleanupAction, string> = {
  [LabelCleanupAction.REMOVE_LABEL]: "Remove the label",
  [LabelCleanupAction.TRASH]: "Move to trash",
};

export function LabelCleanupSetting() {
  return (
    <SettingCard
      title="Label cleanup"
      description="Keep filed folders from growing forever: after a number of days, take the label off or trash the mail."
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Manage
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Label cleanup</DialogTitle>
              <DialogDescription>
                Runs once a day. "Remove the label" leaves the email in All
                Mail, just out of that folder; "Move to trash" lets Gmail delete
                it after 30 more days. Applies to whole threads.
              </DialogDescription>
            </DialogHeader>
            <Content />
          </DialogContent>
        </Dialog>
      }
    />
  );
}

function Content() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<LabelCleanupsResponse>(
    "/api/user/label-cleanup",
  );
  const labels = useLabels();

  const [labelId, setLabelId] = useState("");
  const [afterDays, setAfterDays] = useState("30");
  const [action, setAction] = useState<LabelCleanupAction>(
    LabelCleanupAction.REMOVE_LABEL,
  );

  const save = useAction(saveLabelCleanupAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Cleanup saved" });
      setLabelId("");
      mutate();
    },
    onError: (e) => {
      toastError({ description: getActionErrorMessage(e.error) });
    },
  });

  const remove = useAction(
    deleteLabelCleanupAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Cleanup removed" });
        mutate();
      },
      onError: (e) => {
        toastError({ description: getActionErrorMessage(e.error) });
      },
    },
  );

  const selected = labels.userLabels.find((l) => l.id === labelId);
  const days = Number.parseInt(afterDays, 10);
  const canSave = !!selected && Number.isInteger(days) && days >= 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <LabelCombobox
            userLabels={labels.userLabels}
            isLoading={labels.isLoading}
            mutate={labels.mutate}
            value={{ id: labelId, name: selected?.name ?? null }}
            onChangeValue={setLabelId}
            emailAccountId={emailAccountId}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">after</span>
          <Input
            type="number"
            min={1}
            max={3650}
            value={afterDays}
            onChange={(e) => setAfterDays(e.target.value)}
            className="w-20"
            aria-label="Days"
          />
          <span className="text-sm text-muted-foreground">days</span>
        </div>
        <Select
          value={action}
          onValueChange={(v) => setAction(v as LabelCleanupAction)}
        >
          <SelectTrigger className="w-44" aria-label="Cleanup action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(LabelCleanupAction).map((value) => (
              <SelectItem key={value} value={value}>
                {ACTION_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!canSave || save.isExecuting}
          loading={save.isExecuting}
          onClick={() => {
            if (!selected) return;
            save.execute({
              labelId: selected.id,
              labelName: selected.name,
              afterDays: days,
              action,
            });
          }}
        >
          Save
        </Button>
      </div>

      <LoadingContent loading={isLoading} error={error}>
        {data?.cleanups.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>After</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cleanups.map((cleanup) => (
                <TableRow key={cleanup.id}>
                  <TableCell className="font-medium">
                    {cleanup.labelName}
                  </TableCell>
                  <TableCell>{cleanup.afterDays} days</TableCell>
                  <TableCell>{ACTION_LABELS[cleanup.action]}</TableCell>
                  <TableCell>
                    <MutedText>
                      {cleanup.lastRunAt
                        ? `${formatShortDate(new Date(cleanup.lastRunAt))} · ${cleanup.lastRunCount ?? 0} thread${cleanup.lastRunCount === 1 ? "" : "s"}`
                        : "Not yet"}
                    </MutedText>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Remove cleanup for ${cleanup.labelName}`}
                      disabled={remove.isExecuting}
                      onClick={() => remove.execute({ id: cleanup.id })}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <MutedText>No cleanups yet. Pick a label above to add one.</MutedText>
        )}
      </LoadingContent>
    </div>
  );
}
