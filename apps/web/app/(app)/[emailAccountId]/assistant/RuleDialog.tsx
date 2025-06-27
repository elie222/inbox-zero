"use client";

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

interface RuleDialogProps {
  ruleId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialRule?: Partial<CreateRuleBody>;
  editMode?: boolean;
}

export function RuleDialog({
  ruleId,
  isOpen,
  onClose,
  onSuccess,
  initialRule,
  editMode = true,
}: RuleDialogProps) {
  const { data, isLoading, error } = useRule(ruleId || "");

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={ruleId ? "sr-only" : ""}>
            {ruleId ? "Edit Rule" : "Create Rule"}
          </DialogTitle>
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
                />
              )}
            </LoadingContent>
          ) : (
            <RuleForm
              rule={{
                name: "",
                actions: [],
                conditions: [],
                automate: true,
                runOnThreads: true,
                conditionalOperator: "AND" as const,
                ...initialRule,
              }}
              alwaysEditMode={true}
              onSuccess={handleSuccess}
              isDialog={true}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
