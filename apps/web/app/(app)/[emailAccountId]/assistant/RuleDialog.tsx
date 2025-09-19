"use client";

import { useCallback } from "react";
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

interface RuleDialogProps {
  ruleId?: string;
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
                automate: true,
                runOnThreads: true,
                conditionalOperator: LogicalOperator.AND,
                ...initialRule,
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
