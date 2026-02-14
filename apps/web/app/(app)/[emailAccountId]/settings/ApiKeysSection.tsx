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
import { Card } from "@/components/ui/card";
import { Item, ItemContent, ItemTitle, ItemActions } from "@/components/ui/item";
import { useApiKeys } from "@/hooks/useApiKeys";
import { LoadingContent } from "@/components/LoadingContent";

export function ApiKeysSection() {
  const { data, isLoading, error, mutate } = useApiKeys();

  return (
    <div className="space-y-3">
      <Item size="sm">
        <ItemContent>
          <ItemTitle>API Keys</ItemTitle>
        </ItemContent>
        <ItemActions>
          <ApiKeysCreateButtonModal mutate={mutate} />
        </ItemActions>
      </Item>

      <LoadingContent loading={isLoading} error={error}>
        {data && data.apiKeys.length > 0 ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>{apiKey.name}</TableCell>
                    <TableCell>{apiKey.createdAt.toLocaleString()}</TableCell>
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
          </Card>
        ) : null}
      </LoadingContent>
    </div>
  );
}
