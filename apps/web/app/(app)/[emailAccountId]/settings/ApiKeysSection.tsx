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
import { Item, ItemContent, ItemTitle, ItemActions } from "@/components/ui/item";
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

export function ApiKeysSection() {
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>API Keys</DialogTitle>
            </DialogHeader>
            <LoadingContent loading={isLoading} error={error}>
              {keyCount > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.apiKeys.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell>{apiKey.name}</TableCell>
                        <TableCell>
                          {apiKey.createdAt.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <ApiKeysDeactivateButton
                            id={apiKey.id}
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
