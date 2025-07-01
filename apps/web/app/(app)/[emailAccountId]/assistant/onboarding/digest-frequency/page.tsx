"use client";

import useSWR from "swr";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { updateDigestCategoriesAction } from "@/utils/actions/settings";
import { toastError, toastSuccess } from "@/components/Toast";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  markOnboardingAsCompleted,
  ASSISTANT_ONBOARDING_COOKIE,
} from "@/utils/cookies";
import {
  ExampleDialog,
  SeeExampleDialogButton,
} from "@/app/(app)/[emailAccountId]/assistant/onboarding/ExampleDialog";
import { DigestFrequencyDialog } from "@/app/(app)/[emailAccountId]/assistant/onboarding/DigestFrequencyDialog";
import { Toggle } from "@/components/Toggle";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import type { UpdateDigestCategoriesBody } from "@/utils/actions/settings.validation";
import { categoryConfig } from "@/utils/category-config";
import { Skeleton } from "@/components/ui/skeleton";
import type { GetDigestSettingsResponse } from "@/app/api/user/digest-settings/route";

export default function DigestFrequencyPage() {
  const { emailAccountId } = useAccount();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showExampleDialog, setShowExampleDialog] = useState(false);
  const [showFrequencyDialog, setShowFrequencyDialog] = useState(false);

  const { data: digestSettings, isLoading: isLoadingSettings } =
    useSWR<GetDigestSettingsResponse>("/api/user/digest-settings");

  const [settings, setSettings] = useState<UpdateDigestCategoriesBody>({
    toReply: false,
    newsletter: false,
    marketing: false,
    calendar: false,
    receipt: false,
    notification: false,
    coldEmail: false,
  });

  // Update local state when digest settings are loaded
  useEffect(() => {
    if (digestSettings) {
      setSettings(digestSettings);
    }
  }, [digestSettings]);

  const updateDigestCategories = updateDigestCategoriesAction.bind(
    null,
    emailAccountId,
  );

  const handleToggle = (key: keyof UpdateDigestCategoriesBody) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleFinish = async () => {
    setIsLoading(true);
    try {
      const result = await updateDigestCategories(settings);

      if (result?.serverError) {
        toastError({
          description: "Failed to save digest settings. Please try again.",
        });
      } else {
        toastSuccess({ description: "Digest settings saved!" });
        markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
        router.push(
          prefixPath(emailAccountId, "/assistant/onboarding/completed"),
        );
      }
    } catch (error) {
      toastError({
        description: "Failed to save digest settings. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Digest Email</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <p className="text-muted-foreground">
              Get a summary of actions taken on your behalf in a single email.{" "}
              <SeeExampleDialogButton
                onClick={() => setShowExampleDialog(true)}
              />
            </p>

            <div className="space-y-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Choose categories to include:
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFrequencyDialog(true)}
                >
                  Set frequency
                </Button>
              </div>

              {isLoadingSettings ? (
                <div className="space-y-4">
                  {categoryConfig.map((category) => (
                    <div
                      key={category.key}
                      className="flex items-center gap-4 rounded-lg border p-4"
                    >
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-6 w-11" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {categoryConfig.map((category) => (
                    <div
                      key={category.key}
                      className="flex items-center gap-4 rounded-lg border p-4"
                    >
                      {category.icon}
                      <div className="flex flex-1 items-center gap-2">
                        <span className="font-medium">{category.label}</span>
                        {category.tooltipText && (
                          <TooltipExplanation
                            text={category.tooltipText}
                            className="text-muted-foreground"
                          />
                        )}
                      </div>
                      <Toggle
                        name={category.key}
                        enabled={settings[category.key] || false}
                        onChange={() => handleToggle(category.key)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleFinish}
              loading={isLoading}
              disabled={isLoadingSettings}
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

      <DigestFrequencyDialog
        open={showFrequencyDialog}
        onOpenChange={setShowFrequencyDialog}
      />
    </div>
  );
}
