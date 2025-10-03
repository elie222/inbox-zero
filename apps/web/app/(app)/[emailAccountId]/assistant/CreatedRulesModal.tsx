"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionBadges } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { conditionsToString } from "@/utils/condition";
import { useAccount } from "@/providers/EmailAccountProvider";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { prefixPath } from "@/utils/path";
import type { CreateRuleResult } from "@/utils/rule/types";

export function CreatedRulesModal({
  open,
  onOpenChange,
  rules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: CreateRuleResult[] | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <CreatedRulesContent rules={rules || []} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

export function CreatedRulesContent({
  rules,
  onOpenChange,
}: {
  rules: CreateRuleResult[];
  onOpenChange: (open: boolean) => void;
}) {
  const { emailAccountId, provider } = useAccount();
  const ruleDialog = useDialogState<{ ruleId: string }>();
  const router = useRouter();

  const handleTestRules = () => {
    onOpenChange(false);
    router.push(prefixPath(emailAccountId, "/automation?tab=test"));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600" />
          Rules Created Successfully!
        </DialogTitle>
        <DialogDescription>
          {rules.length === 1
            ? "Your rule has been created. You can now test it or view the details below."
            : `${rules.length} rules have been created. You can now test them or view the details below.`}
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-y-auto flex-1">
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card
              key={rule.id}
              role="button"
              tabIndex={0}
              className="p-4 cursor-pointer"
              onClick={() => ruleDialog.onOpen({ ruleId: rule.id })}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-base">{rule.name}</h4>
                </div>

                <div className="text-sm">
                  <span className="font-medium">Condition:</span>{" "}
                  {conditionsToString(rule)}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Actions:</span>
                  <ActionBadges actions={rule.actions} provider={provider} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <DialogFooter className="flex gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button onClick={handleTestRules}>Test Rules</Button>
      </DialogFooter>
      <RuleDialog
        ruleId={ruleDialog.data?.ruleId}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        editMode={false}
      />
    </>
  );
}
