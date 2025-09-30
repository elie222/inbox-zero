"use client";

import { useCallback, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { mcpAgentAction } from "@/utils/actions/mcp-agent";
import {
  mcpAgentSchema,
  type McpAgentActionInput,
} from "@/utils/actions/mcp-agent.validation";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { McpAgentResponse } from "@/utils/ai/mcp/mcp-agent";

export function McpAgentTest() {
  const [response, setResponse] = useState<McpAgentResponse | null>(null);
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<McpAgentActionInput>({
    resolver: zodResolver(mcpAgentSchema),
    defaultValues: {
      query: "",
      mockMessage: {
        from: "john.smith@example.com",
      },
    },
  });

  const onSubmit: SubmitHandler<McpAgentActionInput> = useCallback(
    async (data) => {
      if (!emailAccountId) {
        toastError({
          title: "Error",
          description: "Email account not found. Please refresh and try again.",
        });
        return;
      }

      setResponse(null);

      const result = await mcpAgentAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error",
          description: result.serverError,
        });
      } else if (result?.data) {
        setResponse(result.data);
      }
    },
    [emailAccountId],
  );

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Test MCP Context Research</CardTitle>
        <p className="text-sm text-gray-600 mt-2">
          This tests the MCP agent's ability to research customer context from
          connected systems like CRMs, payment platforms, and documentation to
          help draft personalized email replies.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            type="email"
            name="mockMessage.from"
            label="Mock Sender Email"
            placeholder="john.smith@example.com"
            registerProps={register("mockMessage.from")}
            error={errors.mockMessage?.from}
          />
          <Input
            type="text"
            name="query"
            label="Email Topic/Question"
            placeholder="e.g., 'billing issue', 'product inquiry', 'support request'"
            registerProps={register("query")}
            error={errors.query}
          />
          <Button type="submit" loading={isSubmitting}>
            Test MCP Context Research
          </Button>
        </form>

        {response && (
          <div className="space-y-4">
            {response.response ? (
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Response:</h4>
                <p className="whitespace-pre-wrap">{response.response}</p>
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

            {response.getToolCalls().length > 0 && (
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">Tool Calls Made:</h4>
                <div className="space-y-2">
                  {response.getToolCalls().map((call, index) => (
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
