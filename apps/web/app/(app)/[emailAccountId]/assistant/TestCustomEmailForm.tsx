"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { SparklesIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { testAiCustomContentAction } from "@/utils/actions/ai-rule";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { ResultsDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import {
  testAiCustomContentBody,
  type TestAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const TestCustomEmailForm = () => {
  const { t } = useLingui();
  const [testResults, setTestResult] = useState<RunRulesResult[]>();
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestAiCustomContentBody>({
    resolver: zodResolver(testAiCustomContentBody),
  });

  const onSubmit: SubmitHandler<TestAiCustomContentBody> = useCallback(
    async (data) => {
      const result = await testAiCustomContentAction(emailAccountId, data);
      if (result?.serverError) {
        toastError({
          title: t`Error testing email`,
          description: result.serverError,
        });
      } else {
        setTestResult(result?.data);
      }
    },
    [emailAccountId, t],
  );

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="content"
          placeholder={t`Paste in email content or write your own. e.g. Receipt from Stripe for $49`}
          registerProps={register("content", { required: true })}
          error={errors.content}
        />
        <Button type="submit" loading={isSubmitting} size="sm">
          <SparklesIcon className="mr-2 size-4" />
          <span>
            <Trans>Test</Trans>
          </span>
        </Button>
      </form>
      {testResults && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              <Trans>Test result</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsDisplay results={testResults} showFullContent={true} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
