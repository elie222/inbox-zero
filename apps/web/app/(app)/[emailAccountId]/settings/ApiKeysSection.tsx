"use client";

import { useCallback, useState, type ComponentProps } from "react";
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
  ItemSeparator,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CopyInput } from "@/components/CopyInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  revokeMcpConnectionAction,
  updateMcpServerAccessAction,
} from "@/utils/actions/api-key";
import type { ApiKeyResponse } from "@/app/api/user/api-keys/route";
import { env } from "@/env";
import { MCP_GUIDE_URL } from "@/utils/mcp/config";

export function ApiKeysSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useApiKeys();

  const keyCount = data?.apiKeys.length ?? 0;
  const mcpEnabled = data?.mcpServerEnabled ?? false;
  const mcpAvailable = data?.mcpServerAvailable ?? false;
  const mcpConnections = data?.mcpConnections ?? [];

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

      mutate(
        {
          ...data,
          mcpServerEnabled: checked,
          mcpConnections: checked ? data.mcpConnections : [],
        },
        false,
      );
      executeUpdateMcpServerAccess({ enabled: checked });
    },
    [data, executeUpdateMcpServerAccess, mutate],
  );

  return (
    <>
      <Item size="sm">
        <ItemContent>
          <ItemTitle>API Access</ItemTitle>
        </ItemContent>
        <ItemActions>
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
      {(mcpAvailable || mcpEnabled) && (
        <>
          <ItemSeparator />
          <McpAccessItem
            enabled={mcpEnabled}
            connections={mcpConnections}
            isLoading={isLoading}
            isExecuting={isExecuting}
            error={error}
            mutate={mutate}
            onToggle={handleToggleMcp}
          />
        </>
      )}
    </>
  );
}

function McpAccessItem({
  enabled,
  connections,
  isLoading,
  isExecuting,
  error,
  mutate,
  onToggle,
}: {
  enabled: boolean;
  connections: ApiKeyResponse["mcpConnections"];
  isLoading: boolean;
  isExecuting: boolean;
  error: ComponentProps<typeof LoadingContent>["error"];
  mutate: () => void;
  onToggle: (checked: boolean) => void;
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  const mcpUrl = `${env.NEXT_PUBLIC_BASE_URL}/mcp`;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>MCP</ItemTitle>
      </ItemContent>
      <ItemActions>
        {connections.length > 0 && (
          <McpConnectionsDialog
            connections={connections}
            isLoading={isLoading}
            error={error}
            mutate={mutate}
          />
        )}
        {enabled && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConnectOpen(true)}
          >
            Connect
          </Button>
        )}
        <Switch
          aria-label="MCP"
          checked={enabled}
          onCheckedChange={(checked) => {
            onToggle(checked);
            setConnectOpen(checked);
          }}
          disabled={isLoading || isExecuting}
        />
      </ItemActions>
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect MCP</DialogTitle>
            <DialogDescription>
              Add this URL in Cursor, Claude, or another MCP client. You'll be
              asked to allow access.
            </DialogDescription>
          </DialogHeader>
          <CopyInput value={mcpUrl} />
          <a
            href={MCP_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Setup guide
          </a>
        </DialogContent>
      </Dialog>
    </Item>
  );
}

function McpConnectionsDialog({
  connections,
  isLoading,
  error,
  mutate,
}: {
  connections: ApiKeyResponse["mcpConnections"];
  isLoading: boolean;
  error: ComponentProps<typeof LoadingContent>["error"];
  mutate: () => void;
}) {
  const { execute: executeRevoke, isExecuting } = useAction(
    revokeMcpConnectionAction,
    {
      onSuccess: () => {
        toastSuccess({ description: "Disconnected" });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to disconnect",
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          MCP apps ({connections.length})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>MCP apps</DialogTitle>
        </DialogHeader>
        <LoadingContent loading={isLoading} error={error}>
          <ul className="space-y-3">
            {connections.map((connection) => (
              <li
                key={connection.clientId}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate text-sm">{connection.name}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isExecuting}
                  aria-label={`Disconnect ${connection.name}`}
                  onClick={() =>
                    executeRevoke({ clientId: connection.clientId })
                  }
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}
