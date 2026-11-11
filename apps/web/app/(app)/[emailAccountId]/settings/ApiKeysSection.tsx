"use client";

import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useApiKeys();
  const keyCount = data?.apiKeys.length ?? 0;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>
          <Trans>API Access</Trans>
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Trans>View keys</Trans>
              {keyCount > 0 ? ` (${keyCount})` : ""}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                <Trans>API Keys</Trans>
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              <Trans>
                Keys created here are limited to the current inbox account.
              </Trans>
            </p>
            <LoadingContent loading={isLoading} error={error}>
              {keyCount > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Trans>Name</Trans>
                      </TableHead>
                      <TableHead>
                        <Trans>Permissions</Trans>
                      </TableHead>
                      <TableHead>
                        <Trans>Created</Trans>
                      </TableHead>
                      <TableHead>
                        <Trans>Expires</Trans>
                      </TableHead>
                      <TableHead>
                        <Trans>Last used</Trans>
                      </TableHead>
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
                            : t`Never`}
                        </TableCell>
                        <TableCell>
                          {apiKey.lastUsedAt
                            ? new Date(apiKey.lastUsedAt).toLocaleString()
                            : t`Never`}
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
                  <Trans>No API keys yet.</Trans>
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
