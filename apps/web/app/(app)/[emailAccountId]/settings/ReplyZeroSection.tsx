"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toggleRuleAction } from "@/utils/actions/rule";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";
import { useSetupProgress } from "@/hooks/useSetupProgress";
import { LoadingContent } from "@/components/LoadingContent";

export function ReplyZeroSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading: isLoadingStatus, mutate } = useSetupProgress();
  const [isToggling, setIsToggling] = useState(false);

  const isEnabled = data?.steps.replyZero ?? false;

  const handleToggle = async () => {
    setIsToggling(true);
    const newEnabled = !isEnabled;

    try {
      const results = await Promise.all(
        CONVERSATION_STATUS_TYPES.map((systemType) =>
          toggleRuleAction(emailAccountId, {
            enabled: newEnabled,
            systemType,
          }),
        ),
      );

      const hasError = results.some((result) => result?.serverError);

      if (hasError) {
        toast.error(
          `Error ${newEnabled ? "enabling" : "disabling"} Reply Zero`,
        );
      } else {
        mutate();
        toast.success(
          `Reply Zero ${newEnabled ? "enabled" : "disabled"} successfully`,
        );
      }
    } catch {
      toast.error(`Error ${newEnabled ? "enabling" : "disabling"} Reply Zero`);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <FormSection>
      <FormSectionLeft
        title="Reply Zero"
        description="Track emails that need your reply and get AI-drafted responses."
      />

      <LoadingContent loading={isLoadingStatus}>
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <Badge color="green">Enabled</Badge>
          ) : (
            <Badge color="gray">Disabled</Badge>
          )}

          <Button
            variant="outline"
            onClick={handleToggle}
            disabled={isToggling}
          >
            {isToggling
              ? isEnabled
                ? "Disabling..."
                : "Enabling..."
              : isEnabled
                ? "Disable"
                : "Enable"}
          </Button>
        </div>
      </LoadingContent>
    </FormSection>
  );
}
