"use client";

import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FrequencyPicker } from "@/app/(app)/[emailAccountId]/settings/FrequencyPicker";
import { useState } from "react";
import { updateDigestFrequencyAction } from "@/utils/actions/settings";
import { toastError, toastSuccess } from "@/components/Toast";
import { prefixPath } from "@/utils/path";
import type { SaveDigestFrequencyBody } from "@/utils/actions/settings.validation";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  markOnboardingAsCompleted,
  ASSISTANT_ONBOARDING_COOKIE,
} from "@/utils/cookies";

export default function DigestFrequencyPage() {
  const { emailAccountId } = useAccount();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [digestFrequencyValue, setDigestFrequencyValue] = useState<
    SaveDigestFrequencyBody["userFrequency"]
  >({
    intervalDays: 7,
    daysOfWeek: 1 << (6 - 1), // Monday (1)
    timeOfDay: new Date(new Date().setHours(11, 0, 0, 0)), // 11 AM
  });

  const updateDigestFrequency = updateDigestFrequencyAction.bind(
    null,
    emailAccountId,
  );

  const handleFinish = async () => {
    if (!digestFrequencyValue) return;

    setIsLoading(true);
    try {
      const result = await updateDigestFrequency({
        userFrequency: digestFrequencyValue,
      });

      if (result?.serverError) {
        toastError({
          description: "Failed to save digest frequency. Please try again.",
        });
      } else {
        toastSuccess({ description: "Digest frequency saved!" });
        markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
        router.push(
          prefixPath(emailAccountId, "/assistant/onboarding/completed"),
        );
      }
    } catch (error) {
      toastError({
        description: "Failed to save digest frequency. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Set your digest frequency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <p className="text-muted-foreground">
              Choose how often you want to receive your digest emails. These
              emails will summarize your important emails and help you stay on
              top of your inbox.
            </p>
            <FrequencyPicker onChange={setDigestFrequencyValue} />
            <Button
              className="w-full"
              onClick={handleFinish}
              disabled={isLoading || !digestFrequencyValue}
            >
              {isLoading ? "Saving..." : "Finish"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
