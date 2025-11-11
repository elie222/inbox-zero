"use client";

import { useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RuleForm } from "./RuleForm";
import { LoadingContent } from "@/components/LoadingContent";
import { useRule } from "@/hooks/useRule";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { useDialogState } from "@/hooks/useDialogState";
import { ActionType, LogicalOperator } from "@prisma/client";
import { ConditionType } from "@/utils/config";
import type { RulesResponse } from "@/app/api/user/rules/route";

interface RuleDialogProps {
  ruleId?: string;
  duplicateRule?: RulesResponse[number];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialRule?: Partial<CreateRuleBody>;
  editMode?: boolean;
}

export function useRuleDialog() {
  const ruleDialog = useDialogState<{ ruleId: string }>();

  const RuleDialogComponent = useCallback(() => {
    return (
      <RuleDialog
        ruleId={ruleDialog.data?.ruleId}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        editMode={false}
      />
    );
  }, [ruleDialog.data?.ruleId, ruleDialog.isOpen, ruleDialog.onClose]);

  return { ruleDialog, RuleDialogComponent };
}

export function RuleDialog({
  ruleId,
  duplicateRule,
  isOpen,
  onClose,
  onSuccess,
  initialRule,
  editMode = true,
}: RuleDialogProps) {
  const { data, isLoading, error, mutate } = useRule(ruleId || "");

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  // Transform duplicateRule to initialRule format
  const duplicateInitialRule = useMemo(() => {
    if (!duplicateRule) return undefined;
    return transformRuleForDuplication(duplicateRule);
  }, [duplicateRule]);

  // Use duplicateInitialRule if provided, otherwise use initialRule
  const finalInitialRule = duplicateInitialRule || initialRule;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader className={ruleId ? "sr-only" : ""}>
          <DialogTitle>{ruleId ? "Edit Rule" : "Create Rule"}</DialogTitle>
        </DialogHeader>
        <div>
          {ruleId ? (
            <LoadingContent loading={isLoading} error={error}>
              {data && (
                <RuleForm
                  rule={data.rule}
                  alwaysEditMode={editMode}
                  onSuccess={handleSuccess}
                  isDialog={true}
                  mutate={mutate}
                  onCancel={onClose}
                />
              )}
            </LoadingContent>
          ) : (
            <RuleForm
              rule={{
                name: "",
                conditions: [
                  {
                    type: ConditionType.AI,
                  },
                ],
                actions: [
                  {
                    type: ActionType.LABEL,
                  },
                ],
                runOnThreads: true,
                conditionalOperator: LogicalOperator.AND,
                ...finalInitialRule,
              }}
              alwaysEditMode={true}
              onSuccess={handleSuccess}
              isDialog={true}
              onCancel={onClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function transformRuleForDuplication(
  rule: RulesResponse[number],
): Partial<CreateRuleBody> {
  const conditions: CreateRuleBody["conditions"] = [];

  // Add AI condition if instructions exist
  if (rule.instructions) {
    conditions.push({
      type: ConditionType.AI,
      instructions: rule.instructions,
    });
  }

  // Add static condition if any static fields exist
  if (rule.from || rule.to || rule.subject || rule.body) {
    conditions.push({
      type: ConditionType.STATIC,
      from: rule.from || undefined,
      to: rule.to || undefined,
      subject: rule.subject || undefined,
      body: rule.body || undefined,
    });
  }

  // If no conditions were created, add a default AI condition
  if (conditions.length === 0) {
    conditions.push({
      type: ConditionType.AI,
    });
  }

  return {
    name: `${rule.name} (Copy)`,
    instructions: rule.instructions || undefined,
    groupId: rule.groupId || undefined,
    runOnThreads: rule.runOnThreads,
    conditionalOperator: rule.conditionalOperator,
    conditions,
    actions: rule.actions.map((action) => ({
      type: action.type,
      labelId: action.labelId
        ? { value: action.labelId, name: action.label || undefined }
        : undefined,
      subject: action.subject ? { value: action.subject } : undefined,
      content: action.content ? { value: action.content } : undefined,
      to: action.to ? { value: action.to } : undefined,
      cc: action.cc ? { value: action.cc } : undefined,
      bcc: action.bcc ? { value: action.bcc } : undefined,
      url: action.url ? { value: action.url } : undefined,
      folderName: action.folderName ? { value: action.folderName } : undefined,
      folderId: action.folderId ? { value: action.folderId } : undefined,
      delayInMinutes: action.delayInMinutes || undefined,
    })),
  };
}
