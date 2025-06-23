"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SchedulePicker } from "@/app/(app)/[emailAccountId]/settings/SchedulePicker";
import { useState } from "react";
import { updateDigestScheduleAction } from "@/utils/actions/settings";
import { toastError, toastSuccess } from "@/components/Toast";
import { prefixPath } from "@/utils/path";
import type { SaveDigestScheduleBody } from "@/utils/actions/settings.validation";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  markOnboardingAsCompleted,
  ASSISTANT_ONBOARDING_COOKIE,
} from "@/utils/cookies";
import {
  ExampleDialog,
  SeeExampleDialogButton,
} from "@/app/(app)/[emailAccountId]/assistant/onboarding/ExampleDialog";

export default function DigestFrequencyPage() {
  const { emailAccountId } = useAccount();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showExampleDialog, setShowExampleDialog] = useState(false);
  const [digestScheduleValue, setDigestScheduleValue] = useState<
    SaveDigestScheduleBody["schedule"]
  >({
    intervalDays: 7,
    daysOfWeek: 1 << (6 - 1), // Monday (1)
    timeOfDay: new Date(new Date().setHours(11, 0, 0, 0)), // 11 AM
    occurrences: 1,
  });

  const updateDigestSchedule = updateDigestScheduleAction.bind(
    null,
    emailAccountId,
  );

  const handleFinish = async () => {
    if (!digestScheduleValue) return;

    setIsLoading(true);
    try {
      const result = await updateDigestSchedule({
        schedule: digestScheduleValue,
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
          <CardTitle>Digest email</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <p className="text-muted-foreground">
              Choose how often you want to receive your digest emails. These
              emails will include a summary of the actions taken on your behalf,
              based on your selected preferences.{" "}
              <SeeExampleDialogButton
                onClick={() => setShowExampleDialog(true)}
              />
            </p>
            <SchedulePicker onChange={setDigestScheduleValue} />
            <Button
              className="w-full"
              onClick={handleFinish}
              disabled={!digestScheduleValue}
              loading={isLoading}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <ExampleDialog
        open={showExampleDialog}
        onOpenChange={setShowExampleDialog}
        title="Digest Email Example"
        description="This is an example of what your digest email will look like."
        image={
          <Image
            src="/images/assistant/digest.png"
            alt="Digest Email Example"
            width={672}
            height={1200}
            className="mx-auto max-w-2xl rounded border-4 border-blue-50 shadow-sm"
          />
        }
      />
    </div>
  );
}
