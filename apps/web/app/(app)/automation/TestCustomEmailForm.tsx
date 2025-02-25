"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { testAiCustomContentAction } from "@/utils/actions/ai-rule";
import { isActionError } from "@/utils/error";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { ProcessResultDisplay } from "@/app/(app)/automation/ProcessResultDisplay";
import {
  testAiCustomContentBody,
  type TestAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import { zodResolver } from "@hookform/resolvers/zod";

export const TestCustomEmailForm = () => {
  const [testResult, setTestResult] = useState<RunRulesResult | undefined>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestAiCustomContentBody>({
    resolver: zodResolver(testAiCustomContentBody),
  });

  const onSubmit: SubmitHandler<TestAiCustomContentBody> = useCallback(
    async (data) => {
      const result = await testAiCustomContentAction(data);
      if (isActionError(result)) {
        toastError({
          title: "Error testing email",
          description: result.error,
        });
      } else {
        setTestResult(result);
      }
    },
    [],
  );

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="content"
          placeholder="Paste in email content or write your own. e.g. Receipt from Stripe for $49"
          registerProps={register("content", { required: true })}
          error={errors.content}
        />
        <Button type="submit" loading={isSubmitting}>
          <SparklesIcon className="mr-2 h-4 w-4" />
          Test
        </Button>
      </form>
      {testResult && (
        <div className="mt-4">
          <ProcessResultDisplay result={testResult} />
        </div>
      )}
    </div>
  );
};
