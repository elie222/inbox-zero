"use client";

import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { copyRulesFromAccountAction } from "@/utils/actions/rule";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { prefixPath } from "@/utils/path";
import { MutedText } from "@/components/Typography";
import { getActionErrorMessage } from "@/utils/error";

type SourceAccount = {
  id: string;
  name: string | null;
  email: string;
};

interface CopyRulesDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceAccounts: SourceAccount[];
  targetAccountEmail: string;
  targetAccountId: string;
}

export function CopyRulesDialog({
  open,
  onOpenChange,
  targetAccountId,
  targetAccountEmail,
  sourceAccounts,
}: CopyRulesDialogProps) {
  const { t } = useLingui();
  const router = useRouter();
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(
    new Set(),
  );

  // Fetch rules from the selected source account
  const {
    data: rules,
    isLoading,
    error,
  } = useSWR<RulesResponse>(
    selectedSourceId ? "/api/user/rules" : null,
    (url: string) =>
      fetch(url, {
        headers: { [EMAIL_ACCOUNT_HEADER]: selectedSourceId },
      }).then((res) => res.json()),
  );

  const { execute, isExecuting } = useAction(copyRulesFromAccountAction, {
    onSuccess: (result) => {
      const { copiedCount, replacedCount } = result.data || {};
      const transferredCount = copiedCount || 0;
      const updatedCount = replacedCount || 0;
      toast.success(t`Rules transferred successfully`, {
        description: t`${plural(transferredCount, {
          one: "# rule transferred",
          other: "# rules transferred",
        })}, ${plural(updatedCount, {
          one: "# rule updated",
          other: "# rules updated",
        })}.`,
        action: {
          label: t`View rules`,
          onClick: () => {
            router.push(prefixPath(targetAccountId, "/automation"));
          },
        },
      });
      onOpenChange(false);
      resetState();
    },
    onError: (error) => {
      toastError({
        title: t`Error transferring rules`,
        description: getActionErrorMessage(error.error),
      });
    },
  });

  const selectedSource = sourceAccounts.find((a) => a.id === selectedSourceId);

  const allSelected = useMemo(() => {
    if (!rules || rules.length === 0) return false;
    return rules.every((rule) => selectedRuleIds.has(rule.id));
  }, [rules, selectedRuleIds]);

  const someSelected = useMemo(() => {
    if (!rules || rules.length === 0) return false;
    return (
      rules.some((rule) => selectedRuleIds.has(rule.id)) &&
      !rules.every((rule) => selectedRuleIds.has(rule.id))
    );
  }, [rules, selectedRuleIds]);

  const handleSelectAll = (checked: boolean) => {
    if (!rules) return;
    if (checked) {
      setSelectedRuleIds(new Set(rules.map((r) => r.id)));
    } else {
      setSelectedRuleIds(new Set());
    }
  };

  const handleToggleRule = (ruleId: string, checked: boolean) => {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(ruleId);
      } else {
        next.delete(ruleId);
      }
      return next;
    });
  };

  const handleCopy = () => {
    if (selectedRuleIds.size === 0) return;
    execute({
      sourceEmailAccountId: selectedSourceId,
      targetEmailAccountId: targetAccountId,
      ruleIds: Array.from(selectedRuleIds),
    });
  };

  const resetState = () => {
    setSelectedSourceId("");
    setSelectedRuleIds(new Set());
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-6">
          <DialogTitle className="break-words">
            <Trans>Transfer rules to {targetAccountEmail}</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Select an account to transfer rules from. Rules with matching
              names will be replaced.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <span className="text-sm font-medium">
              <Trans>Transfer from</Trans>
            </span>
            <Select
              value={selectedSourceId}
              onValueChange={(value) => {
                setSelectedSourceId(value);
                setSelectedRuleIds(new Set());
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={t`Select source account`} />
              </SelectTrigger>
              <SelectContent>
                {sourceAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name || account.email}
                    {account.name && (
                      <span className="ml-2 text-muted-foreground">
                        ({account.email})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSourceId && (
            <LoadingContent loading={isLoading} error={error}>
              {rules && rules.length > 0 ? (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted sticky top-0">
                      <TableRow>
                        <TableHead className="w-10">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={
                                allSelected || (someSelected && "indeterminate")
                              }
                              onCheckedChange={handleSelectAll}
                              aria-label={t`Select all`}
                            />
                          </div>
                        </TableHead>
                        <TableHead>
                          <Trans>Rule</Trans>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={selectedRuleIds.has(rule.id)}
                                onCheckedChange={(checked) =>
                                  handleToggleRule(rule.id, !!checked)
                                }
                                aria-label={t`Select ${rule.name}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="truncate font-medium">
                            {rule.name}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="border-t bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <Trans>
                      {selectedRuleIds.size} of {rules.length} selected
                    </Trans>
                  </div>
                </div>
              ) : (
                <MutedText className="py-4 text-center">
                  <Trans>No rules found in {selectedSource?.email}</Trans>
                </MutedText>
              )}
            </LoadingContent>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleCopy}
            disabled={selectedRuleIds.size === 0}
            loading={isExecuting}
          >
            {selectedRuleIds.size > 0
              ? t`${plural(selectedRuleIds.size, {
                  one: "Transfer # rule",
                  other: "Transfer # rules",
                })}`
              : t`Transfer rules`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
