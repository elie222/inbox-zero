"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiKeysCreateButtonModal,
  ApiKeysDeactivateButton,
} from "@/app/(app)/[emailAccountId]/settings/ApiKeysCreateForm";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemDescription,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useApiKeys } from "@/hooks/useApiKeys";
import { LoadingContent } from "@/components/LoadingContent";
import { formatApiKeyScope } from "@/utils/api-key-scopes";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { updateMcpServerAccessAction } from "@/utils/actions/api-key";

export function ApiKeysSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useApiKeys();

  const keyCount = data?.apiKeys.length ?? 0;
  const mcpEnabled = data?.mcpServerEnabled ?? false;
  const mcpAvailable = data?.mcpServerAvailable ?? false;

  const { execute: executeUpdateMcpServerAccess, isExecuting } = useAction(
    updateMcpServerAccessAction,
    {
      onSuccess: ({ data }) => {
        if (!data) return;

        toastSuccess({
          description: data.enabled
            ? "MCP access enabled!"
            : "MCP access disabled!",
        });
      },
      onError: (error) => {
        mutate();
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update MCP access",
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const handleToggleMcp = useCallback(
    (checked: boolean) => {
      if (!data) return;

      mutate({ ...data, mcpServerEnabled: checked }, false);
      executeUpdateMcpServerAccess({ enabled: checked });
    },
    [data, executeUpdateMcpServerAccess, mutate],
  );

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>API Access</ItemTitle>
        <ItemDescription>
          Manage API keys and optionally allow MCP clients to connect to your
          account.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {mcpAvailable && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">MCP</span>
            <Switch
              checked={mcpEnabled}
              onCheckedChange={handleToggleMcp}
              disabled={isLoading || isExecuting}
            />
          </div>
        )}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              View keys{keyCount > 0 ? ` (${keyCount})` : ""}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>API Keys</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Keys created here are limited to the current inbox account.
            </p>
            <LoadingContent loading={isLoading} error={error}>
              {keyCount > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.apiKeys.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell>{apiKey.name}</TableCell>
                        <TableCell>
                          {apiKey.scopes.map(formatApiKeyScope).join(", ")}
                        </TableCell>
                        <TableCell>
                          {new Date(apiKey.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {apiKey.expiresAt
                            ? new Date(apiKey.expiresAt).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          {apiKey.lastUsedAt
                            ? new Date(apiKey.lastUsedAt).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <ApiKeysDeactivateButton
                            id={apiKey.id}
                            emailAccountId={emailAccountId}
                            mutate={mutate}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No API keys yet.
                </p>
              )}
            </LoadingContent>
          </DialogContent>
        </Dialog>
        <ApiKeysCreateButtonModal mutate={mutate} />
      </ItemActions>
    </Item>
  );
}
