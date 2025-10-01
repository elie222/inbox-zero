"use client";

import { useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { testMcpAction } from "@/utils/actions/mcp";
import {
  testMcpSchema,
  type McpAgentActionInput,
} from "@/utils/actions/mcp.validation";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";

export function McpAgentTest() {
  const { emailAccountId } = useAccount();

  const { executeAsync, result } = useAction(
    testMcpAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "MCP agent test successful",
        });
      },
      onError: (error) => {
        toastError({
          description: error.error.serverError || "Unknown error",
        });
      },
    },
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<McpAgentActionInput>({
    resolver: zodResolver(testMcpSchema),
    defaultValues: {
      from: "john.smith@example.com",
      subject: "Question about your services",
      content:
        "Hi there,\n\nI'm John Smith and I have a question about your services.\n\nCould you please help me with this?\n\nThanks!",
    },
  });

  const onSubmit: SubmitHandler<McpAgentActionInput> = useCallback(
    async (data) => {
      await executeAsync(data);
    },
    [executeAsync],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test MCP Integrations</CardTitle>
        <p className="text-sm text-gray-600 mt-2">
          This tests the MCP agent's ability to research customer context from
          connected systems like CRMs, payment platforms, and documentation to
          help draft personalized email replies.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            type="text"
            name="from"
            label="From"
            placeholder="john.smith@example.com"
            registerProps={register("from")}
            error={errors.from}
          />
          <Input
            type="text"
            name="subject"
            label="Subject"
            placeholder="Question about your services"
            registerProps={register("subject")}
            error={errors.subject}
          />
          <Input
            type="text"
            name="content"
            autosizeTextarea
            rows={3}
            label="Content"
            placeholder="e.g., 'billing issue', 'product inquiry', 'support request'"
            registerProps={register("content")}
            error={errors.content}
          />
          <Button type="submit" loading={isSubmitting}>
            Test
          </Button>
        </form>

        {result?.data && (
          <div className="space-y-4">
            {result.data.response ? (
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Response:</h4>
                <p className="whitespace-pre-wrap">{result.data.response}</p>
              </div>
            ) : (
              <div className="border rounded-lg p-4 bg-yellow-50">
                <h4 className="font-semibold mb-2">
                  No Relevant Information Found
                </h4>
                <p className="text-sm text-gray-600">
                  The MCP agent searched the connected systems but didn't find
                  relevant information.
                </p>
              </div>
            )}

            {result?.data?.toolCalls && result.data.toolCalls.length > 0 && (
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">Tool Calls Made:</h4>
                <div className="space-y-2">
                  {result.data.toolCalls.map((call, index) => (
                    <div
                      key={index}
                      className="text-sm bg-gray-100 p-2 rounded"
                    >
                      <div className="font-mono text-blue-600">
                        {call.toolName}
                      </div>
                      <div className="text-gray-600">
                        Args: {JSON.stringify(call.arguments, null, 2)}
                      </div>
                      <div className="text-gray-500 text-xs mt-1">
                        Result: {call.result}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
