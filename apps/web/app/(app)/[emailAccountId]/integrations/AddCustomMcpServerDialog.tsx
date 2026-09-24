"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MutedText } from "@/components/Typography";
import { toastError, toastSuccess } from "@/components/Toast";
import { useDialogState } from "@/hooks/useDialogState";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createCustomMcpServerAction } from "@/utils/actions/mcp";
import {
  createCustomMcpServerBody,
  type CreateCustomMcpServerBody,
} from "@/utils/actions/mcp.validation";
import { getActionErrorMessage } from "@/utils/error";
import { startMcpOAuth } from "./startMcpOAuth";

export function AddCustomMcpServerDialog() {
  const { emailAccountId } = useAccount();
  const { mutate } = useIntegrations();
  const { isOpen, onToggle, onClose } = useDialogState();

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateCustomMcpServerBody>({
    resolver: zodResolver(createCustomMcpServerBody),
    defaultValues: { authType: "oauth" },
  });

  const authType = watch("authType");

  const { execute, isExecuting } = useAction(
    createCustomMcpServerAction.bind(null, emailAccountId),
    {
      onSuccess: async ({ data, input }) => {
        mutate();
        reset();
        onClose();

        if (input.authType === "api-token") {
          toastSuccess({ description: "Server added" });
          return;
        }

        if (!data?.name) return;

        try {
          await startMcpOAuth({
            integrationName: data.name,
            emailAccountId,
          });
        } catch (error) {
          toastError({
            title: "Error connecting to the server",
            description:
              error instanceof Error && error.message
                ? error.message
                : "Please try again or contact support if the issue persists.",
          });
        }
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogTrigger asChild>
        <Button variant="outline">Add custom server</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom server</DialogTitle>
          <DialogDescription>
            Connect your own remote MCP server so drafts can read from it.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(execute)}>
          <Input
            type="text"
            name="displayName"
            label="Name"
            placeholder="Knowledge base"
            registerProps={register("displayName")}
            error={errors.displayName}
          />
          <Input
            type="text"
            name="serverUrl"
            label="Server URL"
            placeholder="https://mcp.example.com/mcp"
            registerProps={register("serverUrl")}
            error={errors.serverUrl}
          />

          <div className="space-y-1">
            <label className="font-medium text-sm" htmlFor="authType">
              Authentication
            </label>
            <Controller
              name="authType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="authType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oauth">OAuth</SelectItem>
                    <SelectItem value="api-token">API key</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {authType === "api-token" && (
            <Input
              type="password"
              name="apiKey"
              label="API key"
              registerProps={register("apiKey")}
              error={errors.apiKey}
            />
          )}

          <MutedText>
            Read-only tools are enabled automatically. Other tools stay off
            until you turn them on.
          </MutedText>

          <DialogFooter>
            <Button type="submit" loading={isExecuting}>
              Add server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
