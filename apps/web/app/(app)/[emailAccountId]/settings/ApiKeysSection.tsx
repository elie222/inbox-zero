"use client";

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
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
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

export function ApiKeysSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useApiKeys();

  const keyCount = data?.apiKeys.length ?? 0;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>API Keys</ItemTitle>
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
  );
}
